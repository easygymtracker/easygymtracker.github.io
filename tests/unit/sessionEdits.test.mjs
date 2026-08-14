import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Curating today's session (adding an exercise, dropping a set) must survive a
// reload without putting the workout "in progress". These pin the two halves of
// that split: what the snapshot records, and how the page reads it back.

const { buildResumeSnapshot, isResumableFor } = await import("../../src/pages/sessionPage/sessionResumeState.js");
const { SetSeries } = await import("../../src/models/setSeries.js");
const { RepGroup } = await import("../../src/models/repGroup.js");

const NOW = { nowMs: 1_777_000_000_000, nowIso: "2026-04-24T10:00:00.000Z" };

function snapshot(overrides = {}) {
    return buildResumeSnapshot({
        routineId: "rt_1",
        completedRepGroups: new Map(),
        removedSeriesIds: new Set(),
        removedRepGroupIds: new Set(),
        addedSeries: [],
        ...overrides,
    }, NOW);
}

const addedSeries = () => [new SetSeries({
    exerciseId: "ex_1",
    description: "",
    restSecondsAfter: 0,
    repGroups: [new RepGroup({
        exerciseId: "ex_1",
        laterality: "bilateral",
        targetReps: null,
        targetWeight: null,
        restSecondsAfter: 0,
        history: [],
    })],
})];

// --- what "started" means -----------------------------------------------------

test("adding an exercise produces a snapshot that was never started", () => {
    const state = snapshot({ addedSeries: addedSeries() });

    assert.equal(state.startedAtIso, null, "no start timestamp");
    assert.equal(state.elapsedMs, 0, "no elapsed time");
    assert.equal(state.addedSeries.length, 1, "but the exercise is kept");
});

test("dropping a set likewise leaves the session unstarted", () => {
    const state = snapshot({ removedRepGroupIds: new Set(["rg_2"]) });

    assert.equal(state.startedAtIso, null);
    assert.equal(state.elapsedMs, 0);
    assert.deepEqual(state.removedRepGroupIds, ["rg_2"]);
});

test("pressing Start is what marks it started", () => {
    const state = snapshot({
        startedAtIso: "2026-04-24T09:30:00.000Z",
        running: true,
        startEpochMs: NOW.nowMs - 90_000,
    });

    assert.equal(state.startedAtIso, "2026-04-24T09:30:00.000Z");
    assert.equal(state.elapsedMs, 90_000);
});

// --- both kinds still survive a reload ---------------------------------------

test("an edits-only snapshot is still restored, not discarded", () => {
    assert.equal(isResumableFor(snapshot({ addedSeries: addedSeries() }), "rt_1"), true);
    assert.equal(isResumableFor(snapshot({ removedSeriesIds: new Set(["ss_1"]) }), "rt_1"), true);
});

test("an untouched session is not resumable", () => {
    assert.equal(isResumableFor(snapshot(), "rt_1"), false);
});

test("a snapshot from another routine is never offered", () => {
    assert.equal(isResumableFor(snapshot({ addedSeries: addedSeries() }), "rt_other"), false);
});

// --- the page reads the split the same way -----------------------------------

const page = readFileSync("src/pages/sessionPage/sessionPage.js", "utf8");

test("session edits no longer flip hasInitiated", () => {
    for (const fn of ["removeSeriesFromSession", "removeRepGroupFromSession", "addExerciseToSession"]) {
        const start = page.indexOf(`function ${fn}(`);
        assert.ok(start !== -1, `${fn} not found`);
        const body = page.slice(start, page.indexOf("\n    }", start));

        assert.doesNotMatch(body, /hasInitiated\s*=\s*true/,
            `${fn} must not activate the session`);
    }
});

test("persistence no longer requires an active session, only something to save", () => {
    const start = page.indexOf("function persistActiveSessionState(");
    const body = page.slice(start, page.indexOf("\n    }", start));

    assert.match(body, /if \(!hasInitiated && !hasSessionEdits\(\)\) return;/);
});

test("hasSessionEdits covers every session-only mutation", () => {
    const start = page.indexOf("function hasSessionEdits(");
    const body = page.slice(start, page.indexOf("\n    }", start));

    assert.match(body, /addedSeries\.length/);
    assert.match(body, /removedSeriesIds\.size/);
    assert.match(body, /removedRepGroupIds\.size/);
});

test("restoring derives 'started' from the snapshot instead of assuming it", () => {
    const start = page.indexOf("function restoreSessionState(");
    const body = page.slice(start, page.indexOf("\n    }", start));

    assert.doesNotMatch(body, /hasInitiated\s*=\s*true;/, "must not force the session live");
    assert.match(body, /hasInitiated\s*=\s*Boolean\(sessionStartedAtIso\)/);
});

test("only a started session interrupts with the resume prompt", () => {
    assert.match(page, /const wasStarted = Boolean\(resumable\.startedAtIso\) \|\| Number\(resumable\.elapsedMs\) > 0;/);
    assert.match(page, /if \(alreadyConfirmed \|\| !wasStarted \|\| confirm\(t\("confirm\.resumeSession"\)\)\)/);
});

test("declining the resume prompt no longer discards the snapshot", () => {
    const start = page.indexOf("const resumable = readResumableState(routineId);");
    const end = page.indexOf("\n            }", start);
    const body = page.slice(start, end);

    assert.doesNotMatch(body, /\}\s*else\s*\{\s*\n\s*clearActiveSessionState\(\);/,
        "Cancel must leave the stored snapshot alone so it can still be resumed later");
});

test("adding before Start does not move the cursor onto the new exercise", () => {
    // Otherwise Start would begin on the exercise just added, skipping the plan.
    const start = page.indexOf("function addExerciseToSession(");
    const body = page.slice(start, page.indexOf("\n    }", start));

    assert.match(body, /if \(hasInitiated\) \{\s*\n\s*currentSeriesIndex = newIndex;/);
});

// --- editing any set at any time ---------------------------------------------

test("the edit action is wired from the set row to the handler", () => {
    assert.match(page, /data-action="edit-rep-group"/);
    assert.match(page, /closest\('\[data-action="edit-rep-group"\]'\)/);
    assert.match(page, /editRepGroupInSession\(sIdx, rIdx\)/);
});

test("editing neither completes the set nor moves the cursor", () => {
    const start = page.indexOf("async function editRepGroupInSession(");
    const body = page.slice(start, page.indexOf("\n    }", start));

    assert.doesNotMatch(body, /markRepDone|advanceToNext|startRest/,
        "editing is not completing");
    assert.doesNotMatch(body, /currentSeriesIndex\s*=|currentRepGroupIndex\s*=/,
        "editing must not move the workout position");
});

test("editing a logged set rewrites that entry instead of appending one", () => {
    const start = page.indexOf("async function editRepGroupInSession(");
    const body = page.slice(start, page.indexOf("\n    }", start));

    assert.match(body, /rg\.upsertHistory\(recorded\.dateTime/,
        "must reuse the original timestamp so upsertHistory replaces in place");
    assert.doesNotMatch(body, /upsertHistory\(new Date\(\)/);
});

test("editing only touches history the current session wrote", () => {
    const start = page.indexOf("async function editRepGroupInSession(");
    const body = page.slice(start, page.indexOf("\n    }", start));

    // An entry predating this session belongs to a past workout.
    assert.match(body, /latest\.dateTime >= sessionStartedAtIso/);
});

test("an added exercise's edits stay out of the stored routine", () => {
    const start = page.indexOf("async function editRepGroupInSession(");
    const body = page.slice(start, page.indexOf("\n    }", start));

    assert.match(body, /if \(!addedIdx\) routineStore\.update\(persistedRoutine\);/);
});

test("the edit label is translated everywhere", async () => {
    const { DICTS } = await import("../../src/internationalization/dicts.js");
    for (const [lang, dict] of Object.entries(DICTS)) {
        assert.ok(dict["session.editSet"], `${lang} is missing session.editSet`);
        assert.notEqual(dict["session.editSet"], "session.editSet");
    }
});
