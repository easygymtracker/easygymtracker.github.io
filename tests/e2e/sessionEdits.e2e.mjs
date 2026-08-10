// tests/e2e/sessionEdits.e2e.mjs
//
// Two behaviours, driven through the real app:
//   1. curating today's session (adding an exercise) must NOT start the workout
//   2. any set's reps/weight can be edited at any point in the session
//
// Run: BASE_URL=... CDP_URL=... node tests/e2e/sessionEdits.e2e.mjs

import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:8080";
const CDP = process.env.CDP_URL ?? "http://localhost:9222";

const NS = "gymapp_v1";
const RID = "rt_edit";
const XID = "ex_edit";

const env = (payload) => JSON.stringify({ __meta: { schemaVersion: 1 }, payload });
const repGroup = (id) => ({
    type: "RepGroup", id, exerciseId: XID, laterality: "bilateral",
    targetReps: 10, targetWeight: 20, restSecondsAfter: 0, history: [],
});

const SEED = {
    [`${NS}:exercises:index`]: env([XID]),
    [`${NS}:exercises:${XID}`]: env({ type: "Exercise", id: XID, description: "Bench Press" }),
    [`${NS}:routines:index`]: env([RID]),
    [`${NS}:routines:${RID}`]: env({
        type: "Routine", id: RID, name: "Edit Routine", description: "seeded",
        series: [{
            type: "SetSeries", id: "ss_1", description: "", exerciseId: XID, restSecondsAfter: 0,
            repGroups: [repGroup("rg_1"), repGroup("rg_2")],
        }],
    }),
    [`${NS}:workoutSessions:entries`]: env([]),
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

const dialogs = [];
page.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.accept();
});

async function seed() {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.evaluate((s) => {
        localStorage.clear();
        for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
        localStorage.setItem("gymapp_onboarding_tour_seen", "true");
    }, SEED);
}

const readRoutine = () => page.evaluate((ns) =>
    JSON.parse(localStorage.getItem(`${ns}:routines:${"rt_edit"}`)).payload, NS);

const readActive = () => page.evaluate((ns) => {
    const raw = localStorage.getItem(`${ns}:workoutSessions:active`);
    return raw ? JSON.parse(raw).payload : null;
}, NS);

const sessionUi = () => page.evaluate(() => {
    const visible = (el) => Boolean(el) && el.offsetParent !== null;
    return {
        finishVisible: visible(document.getElementById("btnSessionFinish")),
        stopVisible: visible(document.getElementById("btnSessionStop")),
        timer: document.getElementById("sessionTimer")?.textContent?.trim() ?? null,
        currentPanelVisible: visible(document.getElementById("sessionCurrentExercise")),
    };
});

// =============================================================================
// 1. Adding a temporary exercise must not start the session
// =============================================================================

await seed();
await page.goto(`${BASE}/?p=/session/${RID}`, { waitUntil: "networkidle" });
await page.waitForSelector("#btnSessionStartPause");

const before = await sessionUi();
check(!before.finishVisible && !before.stopVisible, "before adding: Finish/Stop hidden", before);

await page.fill("#sessionAddExerciseInput", "Temporary Curl");
await page.click("#btnSessionAddExercise");
await page.waitForTimeout(400);

const after = await sessionUi();
check(!after.finishVisible && !after.stopVisible,
    "adding a temp exercise leaves the session NOT started (Finish/Stop stay hidden)", after);
check(after.timer === before.timer, "the timer did not start", { before: before.timer, after: after.timer });
check(!after.currentPanelVisible, "the in-workout panel stays closed", after);

const addedVisible = await page.evaluate(() =>
    document.getElementById("sessionSeriesList")?.textContent?.includes("Temporary Curl"));
check(addedVisible, "...but the exercise is on the list");

const sessions = await page.evaluate((ns) =>
    JSON.parse(localStorage.getItem(`${ns}:workoutSessions:entries`)).payload, NS);
check(sessions.length === 0, "no workout record was opened", sessions.length);

const active = await readActive();
check(active?.addedSeries?.length === 1, "the edit is saved so a reload keeps it", active?.addedSeries?.length);
check(!active?.startedAtIso && !active?.elapsedMs,
    "the saved snapshot is marked as never started", { startedAtIso: active?.startedAtIso, elapsedMs: active?.elapsedMs });

// Reload: restored silently, no "resume?" prompt.
dialogs.length = 0;
await page.goto(`${BASE}/?p=/session/${RID}`, { waitUntil: "networkidle" });
await page.waitForSelector("#btnSessionStartPause");
await page.waitForTimeout(400);

const reloaded = await page.evaluate(() =>
    document.getElementById("sessionSeriesList")?.textContent?.includes("Temporary Curl"));
check(reloaded, "the added exercise survives a reload");
check(dialogs.length === 0, "no resume prompt for a session that was never started", dialogs);

const afterReload = await sessionUi();
check(!afterReload.finishVisible && !afterReload.stopVisible,
    "still not started after the reload", afterReload);

// Start now: it must begin on the routine's first set, not the added exercise.
await page.click("#btnSessionStartPause");
await page.waitForSelector('[data-action="complete-current-set"]');

const started = await sessionUi();
check(started.finishVisible && started.stopVisible, "Start does show Finish/Stop", started);

const startedOn = await page.evaluate(() =>
    document.getElementById("sessionCurrentExercise")?.textContent ?? "");
check(startedOn.includes("Bench Press"),
    "the workout starts on the first pending routine set, not on the added exercise",
    startedOn.slice(0, 60));

// =============================================================================
// 2. Editing reps/weight of any set, at any time
// =============================================================================

async function editSet({ seriesIdx, repIdx, reps, weight }) {
    await page.click(`[data-action="edit-rep-group"][data-series-idx="${seriesIdx}"][data-rep-idx="${repIdx}"]`);
    await page.waitForSelector(".modalOverlay .modalCard");
    await page.fill('.modalOverlay [data-field="reps"]', String(reps));
    await page.fill('.modalOverlay [data-field="weight"]', String(weight));
    await page.click('.modalOverlay [data-action="confirm"]');
    await page.waitForSelector(".modalOverlay", { state: "detached" });
    await page.waitForTimeout(250);
}

// Cursor position read from the list, not the panel text: the panel holds a
// running timer, so its text differs between two reads regardless.
const activePos = () => page.evaluate(() => {
    const el = document.querySelector(".repGroupItem--active");
    return el ? `${el.dataset.seriesIdx}:${el.dataset.repIdx}` : null;
});

// The second set is not the cursor position, and is not done: editing the plan.
const posBefore = await activePos();

await editSet({ seriesIdx: 0, repIdx: 1, reps: 12, weight: 35 });

const routineAfterPlanEdit = await readRoutine();
const rg2 = routineAfterPlanEdit.series[0].repGroups[1];
check(rg2.targetReps === 12 && rg2.targetWeight === 35,
    "editing a pending set updates its target reps/weight", { reps: rg2.targetReps, weight: rg2.targetWeight });
check((rg2.history ?? []).length === 0, "...without logging it as performed", rg2.history?.length);

const posAfter = await activePos();
check(posAfter === posBefore && posBefore !== null,
    "...and without moving the workout position", { posBefore, posAfter });

const rowShows = await page.evaluate(() =>
    document.querySelector('.repGroupItem[data-series-idx="0"][data-rep-idx="1"]')?.textContent ?? "");
check(rowShows.includes("12") && rowShows.includes("35"), "the row reflects the new values", rowShows.trim());

// Now complete set 1, then correct what was logged.
await page.click('[data-action="complete-current-set"]');
await page.waitForSelector(".modalOverlay .modalCard");
await page.fill('.modalOverlay [data-field="reps"]', "10");
await page.fill('.modalOverlay [data-field="weight"]', "20");
await page.click('.modalOverlay [data-action="confirm"]');
await page.waitForSelector(".modalOverlay", { state: "detached" });
await page.waitForTimeout(400);

const logged = (await readRoutine()).series[0].repGroups[0].history;
check(logged.length === 1, "completing the set logs one entry", logged.length);

await editSet({ seriesIdx: 0, repIdx: 0, reps: 7, weight: 25 });

const corrected = (await readRoutine()).series[0].repGroups[0].history;
check(corrected.length === 1, "correcting a logged set does not append a second entry", corrected.length);
check(corrected[0].reps === 7 && corrected[0].weight === 25,
    "...it rewrites the recorded values", corrected[0]);
check(corrected[0].dateTime === logged[0].dateTime,
    "...keeping the original timestamp", { before: logged[0].dateTime, after: corrected[0].dateTime });

// The added (session-only) exercise must stay out of the stored routine.
const addedIdx = (await readRoutine()).series.length;
// Its sets only render once the exercise row is expanded.
await page.click(`.seriesItem[data-series-idx="${addedIdx}"]`);
await page.waitForSelector(`[data-action="edit-rep-group"][data-series-idx="${addedIdx}"][data-rep-idx="0"]`);
await editSet({ seriesIdx: addedIdx, repIdx: 0, reps: 15, weight: 10 });

const routineFinal = await readRoutine();
check(routineFinal.series.length === 1,
    "editing the temp exercise never adds it to the routine", routineFinal.series.length);

const activeFinal = await readActive();
const addedRg = activeFinal?.addedSeries?.[0]?.repGroups?.[0];
check(addedRg?.targetReps === 15 && addedRg?.targetWeight === 10,
    "...its edit lands in the session snapshot instead",
    { reps: addedRg?.targetReps, weight: addedRg?.targetWeight });

check(pageErrors.length === 0, "no uncaught page errors", pageErrors);

await page.close();
await browser.close();

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
