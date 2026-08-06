// tests/e2e/sharedUi.e2e.mjs
//
// Drives the real app to check the extracted primitives still behave, and that
// the listener leak the shared modal shell was meant to fix is actually gone.
//
// Run: BASE_URL=... CDP_URL=... node tests/e2e/sharedUi.e2e.mjs

import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:8080";
const CDP = process.env.CDP_URL ?? "http://localhost:9222";

const NS = "gymapp_v1";
const RID = "rt_ui";
const XID = "ex_ui";

const env = (payload) => JSON.stringify({ __meta: { schemaVersion: 1 }, payload });
const repGroup = (id, history = []) => ({
    type: "RepGroup", id, exerciseId: XID, laterality: "bilateral",
    targetReps: 10, targetWeight: 20, restSecondsAfter: 0, history,
});

const SEED = {
    [`${NS}:exercises:index`]: env([XID]),
    [`${NS}:exercises:${XID}`]: env({ type: "Exercise", id: XID, description: "Bench Press" }),
    [`${NS}:routines:index`]: env([RID]),
    [`${NS}:routines:${RID}`]: env({
        type: "Routine", id: RID, name: "UI Routine", description: "seeded",
        series: [{
            type: "SetSeries", id: "ss_1", description: "", exerciseId: XID, restSecondsAfter: 0,
            repGroups: [
                repGroup("rg_1", [{ dateTime: "2026-07-01T10:00:00.000Z", reps: 8, weight: 20 }]),
                repGroup("rg_2"),
            ],
        }],
    }),
    [`${NS}:workoutSessions:entries`]: env([]),
    [`${NS}:profile:entries`]: env([
        { recordedAt: "2026-07-01T08:00:00.000Z", weightKg: 80, bodyFatPct: 18, muscleKg: 35 },
        { recordedAt: "2026-07-15T08:00:00.000Z", weightKg: 79, bodyFatPct: 17.5, muscleKg: 35.5 },
    ]),
};

let failures = 0;
function check(ok, label, detail) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ""}`);
    if (!ok) failures += 1;
}

const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0] ?? (await browser.newContext());
for (const open of ctx.pages()) await open.close().catch(() => {});

const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push(err.message));

// Count document-level keydown listeners so an unbalanced modal shows up.
await page.addInitScript(() => {
    window.__docKeydown = 0;
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    document.addEventListener = (type, ...rest) => {
        if (type === "keydown") window.__docKeydown += 1;
        return add(type, ...rest);
    };
    document.removeEventListener = (type, ...rest) => {
        if (type === "keydown") window.__docKeydown -= 1;
        return remove(type, ...rest);
    };
});

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.evaluate((seed) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    // Skip the onboarding tour so it does not sit on top of everything.
    localStorage.setItem("gymapp_onboarding_tour_seen", "true");
}, SEED);

// --- 1. the set modal: open/close balance ------------------------------------

await page.goto(`${BASE}/?p=/session/${RID}`, { waitUntil: "networkidle" });
// The set controls only appear once the session is running.
await page.click("#btnSessionStartPause");
await page.waitForSelector('[data-action="complete-current-set"]');

const baseline = await page.evaluate(() => window.__docKeydown);

async function openAndClose(closer) {
    await page.click('[data-action="complete-current-set"]');
    await page.waitForSelector(".modalOverlay .modalCard");
    await closer();
    await page.waitForSelector(".modalOverlay", { state: "detached" });
}

await openAndClose(() => page.click('.modalOverlay [data-action="cancel"]'));
const afterCancel = await page.evaluate(() => window.__docKeydown);
check(afterCancel === baseline, "closing with the Cancel button unregisters the keydown listener",
    { baseline, afterCancel });

await openAndClose(() => page.keyboard.press("Escape"));
const afterEscape = await page.evaluate(() => window.__docKeydown);
check(afterEscape === baseline, "closing with Escape unregisters it too", { baseline, afterEscape });

// Backdrop: click the overlay itself, away from the card.
await openAndClose(async () => {
    const box = await page.locator(".modalOverlay").boundingBox();
    await page.mouse.click(box.x + 6, box.y + 6);
});
const afterBackdrop = await page.evaluate(() => window.__docKeydown);
check(afterBackdrop === baseline, "closing by backdrop unregisters it too", { baseline, afterBackdrop });

// Ten cycles: a per-open leak would be obvious by now.
for (let i = 0; i < 10; i++) {
    await openAndClose(() => page.keyboard.press("Escape"));
}
const afterMany = await page.evaluate(() => window.__docKeydown);
check(afterMany === baseline, "ten open/close cycles leave no listeners behind", { baseline, afterMany });

// --- 2. the modal still works ------------------------------------------------

await page.click('[data-action="complete-current-set"]');
await page.waitForSelector(".modalOverlay .modalCard");

const modalShape = await page.evaluate(() => {
    const card = document.querySelector(".modalOverlay .modalCard");
    return {
        role: card?.getAttribute("role"),
        ariaModal: card?.getAttribute("aria-modal"),
        hasReps: Boolean(card?.querySelector('[data-field="reps"]')),
        hasConfirm: Boolean(card?.querySelector('[data-action="confirm"]')),
    };
});
check(modalShape.role === "dialog" && modalShape.ariaModal === "true",
    "every modal now announces itself as a dialog", modalShape);
check(modalShape.hasReps && modalShape.hasConfirm, "the set modal still renders its fields", modalShape);

await page.fill('.modalOverlay [data-field="reps"]', "9");
await page.fill('.modalOverlay [data-field="weight"]', "22.5");
await page.click('.modalOverlay [data-action="confirm"]');
await page.waitForSelector(".modalOverlay", { state: "detached" });

const recorded = await page.evaluate((ns) => {
    const raw = JSON.parse(localStorage.getItem(`${ns}:routines:rt_ui`)).payload;
    const history = raw.series[0].repGroups[0].history;
    return history[history.length - 1];
}, NS);
check(recorded?.reps === 9 && recorded?.weight === 22.5,
    "confirming the modal still writes the set through", recorded);

// --- 2b. the modal that actually leaked --------------------------------------
//
// sessionSetModal already tore down correctly; the history edit modal and the
// workout summary only removed their keydown listener on the Escape path, so
// closing any other way left one attached for the life of the page. This is the
// case that used to fail.

await page.goto(`${BASE}/?p=/exercise/${XID}/history`, { waitUntil: "networkidle" });
await page.waitForSelector('#exerciseHistoryList [data-action="edit"]');

const historyBaseline = await page.evaluate(() => window.__docKeydown);

for (let i = 0; i < 5; i++) {
    await page.click('#exerciseHistoryList [data-action="edit"]');
    await page.waitForSelector(".modalOverlay .exHistEditModal");
    // Cancel, not Escape: the path the old code forgot about.
    await page.click('.modalOverlay [data-action="cancel-edit"]');
    await page.waitForSelector(".modalOverlay", { state: "detached" });
}

const afterHistoryEdits = await page.evaluate(() => window.__docKeydown);
check(afterHistoryEdits === historyBaseline,
    "five Cancel closes of the history edit modal leak nothing (this used to grow by 5)",
    { historyBaseline, afterHistoryEdits });

// And it still saves.
await page.click('#exerciseHistoryList [data-action="edit"]');
await page.waitForSelector(".modalOverlay .exHistEditModal");
await page.fill('.modalOverlay [data-field="reps"]', "11");
await page.click('.modalOverlay [data-action="save-edit"]');
await page.waitForSelector(".modalOverlay", { state: "detached" });

const editedReps = await page.evaluate(() =>
    document.querySelector("#exerciseHistoryList")?.textContent?.includes("11"));
check(editedReps, "editing an entry through the shared shell still persists and re-renders");

// --- 3. the onboarding tour (same shell, wizard steps) -----------------------

const tourSteps = await page.evaluate(async () => {
    const { openOnboardingTour } = await import("/src/ui/components/onboardingTourModal.js");
    const done = openOnboardingTour();

    const card = document.querySelector(".modalOverlay .modalCard");
    const titles = [card.querySelector(".tourTitle").textContent.trim()];
    for (let i = 0; i < 4; i++) {
        card.querySelector('[data-action="next"]').click();
        titles.push(card.querySelector(".tourTitle").textContent.trim());
    }
    card.querySelector('[data-action="next"]').click();
    await done;

    return { titles, stillOpen: Boolean(document.querySelector(".modalOverlay")) };
});
check(tourSteps.titles.length === 5 && new Set(tourSteps.titles).size === 5,
    "the tour still advances through five distinct steps", tourSteps.titles);
check(!tourSteps.stillOpen, "finishing the tour closes and resolves");

const afterTour = await page.evaluate(() => window.__docKeydown);
check(afterTour === baseline, "the tour cleans up after itself too", { baseline, afterTour });

// --- 4. shared formatters and the shared chart on the profile page -----------

await page.goto(`${BASE}/?p=/profile`, { waitUntil: "networkidle" });
await page.waitForSelector("#route-profile:not(.routeHidden)");

const profile = await page.evaluate(() => {
    const chart = document.querySelector("#route-profile svg.lineChart");
    const text = document.querySelector("#route-profile")?.textContent ?? "";
    return {
        chartRendered: Boolean(chart),
        chartWidth: chart ? getComputedStyle(chart).width : null,
        hasAxisLabels: chart ? chart.querySelectorAll("text").length : 0,
        // The shared formatter must not leave raw ISO strings on screen.
        rawIso: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(text),
        rawKey: /\b(profile|backup|common)\.[a-zA-Z.]+\b/.test(text),
    };
});
check(profile.chartRendered, "the shared line chart renders on the profile page");
check(profile.chartWidth && parseFloat(profile.chartWidth) > 100,
    "the chart is sized by CSS now that the inline style is gone", profile.chartWidth);
check(profile.hasAxisLabels >= 3, "it keeps the axis labels from the richer copy", profile.hasAxisLabels);
check(!profile.rawIso, "dates render formatted, not as raw ISO");
check(!profile.rawKey, "no untranslated i18n key leaked into the page");

// --- 5. surface tokens resolve ------------------------------------------------

const tokens = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return ["--surface-1", "--surface-2", "--surface-3"].map((n) => s.getPropertyValue(n).trim());
});
check(tokens.every((v) => v.startsWith("rgba(")), "surface tokens are defined", tokens);

const btnBg = await page.evaluate(() => {
    const btn = document.querySelector(".btn");
    return btn ? getComputedStyle(btn).backgroundColor : null;
});
check(btnBg && btnBg !== "rgba(0, 0, 0, 0)", "components using the tokens still paint", btnBg);

check(pageErrors.length === 0, "no uncaught page errors during the run", pageErrors);

await page.close();
await browser.close();

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
