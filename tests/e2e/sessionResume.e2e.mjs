// tests/e2e/sessionResume.e2e.mjs
//
// Drives the real app in Chrome and checks the resume / Finish / Stop flow.
//
// Prerequisites (kept out of package.json — the app itself has no deps):
//   1. serve the repo root:   python -m http.server 8080
//   2. start Chrome with CDP: chrome --headless=new --remote-debugging-port=9222
//                                    --user-data-dir=<temp dir> --no-first-run
//   3. install the driver:    npm i --no-save playwright-core
//
// Run: npm run test:e2e     (override with BASE_URL / CDP_URL)

import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:8080";
const CDP = process.env.CDP_URL ?? "http://localhost:9222";

const NS = "gymapp_v1";
const RID = "rt_e2e";
const XID = "ex_e2e";

const env = (payload) => JSON.stringify({ __meta: { schemaVersion: 1 }, payload });
const repGroup = (id) => ({
    type: "RepGroup",
    id,
    exerciseId: XID,
    laterality: "bilateral",
    targetReps: 10,
    targetWeight: 20,
    restSecondsAfter: 0,
    history: [],
});
const SEED = {
    [`${NS}:exercises:index`]: env([XID]),
    [`${NS}:exercises:${XID}`]: env({ type: "Exercise", id: XID, description: "Bench Press" }),
    [`${NS}:routines:index`]: env([RID]),
    [`${NS}:routines:${RID}`]: env({
        type: "Routine",
        id: RID,
        name: "E2E Routine",
        description: "seeded",
        series: [
            { type: "SetSeries", id: "ss_1", description: "", exerciseId: XID, restSecondsAfter: 0, repGroups: [repGroup("rg_1"), repGroup("rg_2")] },
            { type: "SetSeries", id: "ss_2", description: "", exerciseId: XID, restSecondsAfter: 0, repGroups: [repGroup("rg_3"), repGroup("rg_4")] },
        ],
    }),
    [`${NS}:workoutSessions:entries`]: env([]),
};

let failures = 0;
function check(ok, label) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures += 1;
}

const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0] ?? (await browser.newContext());

// Stale tabs keep ticking and rewrite workoutSessions:active — start clean.
for (const open of ctx.pages()) await open.close().catch(() => {});

const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

let acceptDialogs = true;
page.on("dialog", (d) => (acceptDialogs ? d.accept() : d.dismiss()));

const readStore = () => page.evaluate((ns) => ({
    active: JSON.parse(localStorage.getItem(`${ns}:workoutSessions:active`) || "null")?.payload ?? null,
    entries: JSON.parse(localStorage.getItem(`${ns}:workoutSessions:entries`) || "null")?.payload ?? [],
}), NS);

async function openSession() {
    await page.goto(`${BASE}/?p=/session/${RID}`, { waitUntil: "load" });
    await page.waitForSelector("#sessionSeriesList", { state: "attached" });
    await page.waitForTimeout(500);
}

async function completeCurrentSet() {
    await page.click('[data-action="complete-current-set"]');
    await page.click('.modalOverlay [data-action="confirm"]');
    await page.waitForSelector(".modalOverlay", { state: "detached" });
    await page.waitForTimeout(500);
}

try {
    // seed
    await page.goto(`${BASE}/?p=/routines`, { waitUntil: "domcontentloaded" });
    await page.evaluate((seed) => {
        localStorage.clear();
        for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    }, SEED);

    // 1. session actions only appear once the workout has started
    await openSession();
    check(await page.isHidden("#btnSessionFinish") && await page.isHidden("#btnSessionStop"),
        "Finish/Stop hidden before start");

    await page.click("#btnSessionStartPause");
    await page.waitForTimeout(1500);
    check(await page.isVisible("#btnSessionFinish") && await page.isVisible("#btnSessionStop"),
        "Finish/Stop visible after start");

    // 2. one set completed -> resumable state + unfinished history entry
    await completeCurrentSet();
    let store = await readStore();
    check(store.active?.routineId === RID && store.active.completedRepGroups.length === 1,
        "active state persisted after a set");
    check(store.entries.length === 1 && store.entries[0].isCompleted === false,
        "unfinished entry written");
    const timerBeforeReload = await page.textContent("#sessionTimer");

    // 3. accidental close -> hard reload -> resume
    await openSession();
    check((await page.textContent("#sessionTimer")) !== "00:00",
        `session timer restored (was ${timerBeforeReload})`);
    check((await page.locator("#sessionSeriesList .repGroupItem--done").count()) >= 1,
        "completed set restored in the UI");
    store = await readStore();
    check(store.entries.length === 1, "resume reuses the entry (no duplicate)");

    // 4. Stop -> unfinished, still resumable, leaves the session
    await page.click("#btnSessionStartPause");
    await page.waitForTimeout(800);
    await completeCurrentSet();
    await page.click("#btnSessionStop");
    await page.waitForTimeout(800);
    check(new URL(page.url()).pathname === "/routines", "Stop leaves the session page");
    store = await readStore();
    check(store.active !== null, "Stop keeps the state resumable");
    check(store.entries.length === 1 && store.entries[0].isCompleted === false,
        "Stop keeps the entry unfinished");

    // 5. resume again, then Finish with sets still pending
    await openSession();
    check((await page.locator("#sessionSeriesList .seriesItem--done").count()) === 1
        && (await page.locator("#sessionSeriesList .seriesItem--active").count()) === 1,
        "resumed on the next pending exercise");

    await page.click("#btnSessionStartPause");
    await page.waitForTimeout(600);
    await page.click("#btnSessionFinish");
    await page.waitForTimeout(1500);
    store = await readStore();
    check(store.entries.length === 1 && store.entries[0].isCompleted === true,
        "Finish closes the session as completed");
    check(store.active === null, "Finish clears the resumable state");
    check(store.entries[0].totals?.sets === 2,
        `Finish keeps pre-reload progress (sets=${store.entries[0].totals?.sets})`);

    // 6. declining the resume prompt discards the snapshot
    await page.evaluate((ns) => localStorage.setItem(`${ns}:workoutSessions:active`, JSON.stringify({
        __meta: { schemaVersion: 1 },
        payload: {
            sessionId: "ws_stale", routineId: "rt_e2e", startedAtIso: "2026-01-01T10:00:00.000Z",
            elapsedMs: 60000, currentSeriesIndex: 0, currentRepGroupIndex: 0,
            sessionSeriesOrder: [0, 1], completedRepGroups: [[0, [0]]],
        },
    })), NS);

    acceptDialogs = false;
    await openSession();
    store = await readStore();
    check(store.active === null, "declining the resume prompt discards the state");
    check((await page.textContent("#sessionTimer")) === "00:00", "declined resume starts a fresh timer");
} finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
}

console.log(failures === 0 ? "\nall e2e checks passed" : `\n${failures} e2e check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
