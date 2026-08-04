import test from "node:test";
import assert from "node:assert/strict";

import {
    buildResumeSnapshot,
    deserializeCompletedRepGroups,
    deserializeIdSet,
    isResumableFor,
    resolveResumePosition,
    serializeCompletedRepGroups,
    serializeIdSet,
} from "../../src/pages/sessionPage/sessionResumeState.js";

function routine(seriesSizes) {
    return {
        id: "rt_1",
        series: seriesSizes.map((count) => ({
            repGroups: Array.from({ length: count }, () => ({})),
        })),
    };
}

const done = (entries) => new Map(entries.map(([s, reps]) => [s, new Set(reps)]));

test("completedRepGroups survives a serialize/deserialize round trip", () => {
    const map = done([[0, [0, 1]], [2, [3]]]);
    const restored = deserializeCompletedRepGroups(serializeCompletedRepGroups(map));

    assert.deepEqual([...restored.keys()], [0, 2]);
    assert.deepEqual([...restored.get(0)], [0, 1]);
    assert.deepEqual([...restored.get(2)], [3]);
});

test("serialize tolerates a missing map, deserialize tolerates garbage", () => {
    assert.deepEqual(serializeCompletedRepGroups(null), []);
    assert.deepEqual(serializeCompletedRepGroups(undefined), []);

    const restored = deserializeCompletedRepGroups([["x", [0]], [1, "nope"], [2, [0, "a", -1, 1.5, 3]], null]);
    assert.deepEqual([...restored.keys()], [1, 2]);
    assert.deepEqual([...restored.get(1)], []);
    assert.deepEqual([...restored.get(2)], [0, 3]);
});

test("id sets survive a serialize/deserialize round trip", () => {
    const set = new Set(["ss_1", "ss_2"]);
    assert.deepEqual(serializeIdSet(set), ["ss_1", "ss_2"]);
    assert.deepEqual(deserializeIdSet(serializeIdSet(set)), set);
});

test("id set helpers tolerate missing or garbage input", () => {
    assert.deepEqual(serializeIdSet(null), []);
    assert.deepEqual(serializeIdSet(undefined), []);
    assert.deepEqual(deserializeIdSet(null), new Set());
    assert.deepEqual(deserializeIdSet(["a", "", 1, null, "b"]), new Set(["a", "b"]));
});

test("snapshot keeps the paused elapsed time as-is", () => {
    const snap = buildResumeSnapshot({
        sessionId: "ws_1",
        routineId: "rt_1",
        startedAtIso: "2026-08-04T10:00:00.000Z",
        running: false,
        startEpochMs: 1_000,
        elapsedMs: 42_000,
        currentSeriesIndex: 1,
        currentRepGroupIndex: 2,
        sessionSeriesOrder: [1, 0],
        completedRepGroups: done([[0, [0, 1]]]),
    }, { nowMs: 999_999, nowIso: "2026-08-04T10:05:00.000Z" });

    assert.equal(snap.elapsedMs, 42_000);
    assert.equal(snap.sessionId, "ws_1");
    assert.equal(snap.startedAtIso, "2026-08-04T10:00:00.000Z");
    assert.equal(snap.currentSeriesIndex, 1);
    assert.equal(snap.currentRepGroupIndex, 2);
    assert.deepEqual(snap.sessionSeriesOrder, [1, 0]);
    assert.deepEqual(snap.completedRepGroups, [[0, [0, 1]]]);
    assert.deepEqual(snap.removedSeriesIds, []);
    assert.deepEqual(snap.removedRepGroupIds, []);
    assert.equal(snap.updatedAt, "2026-08-04T10:05:00.000Z");
});

test("snapshot carries removed series/repGroup ids", () => {
    const snap = buildResumeSnapshot({
        routineId: "rt_1",
        completedRepGroups: new Map(),
        removedSeriesIds: new Set(["ss_2"]),
        removedRepGroupIds: new Set(["rg_3", "rg_4"]),
    }, { nowMs: 0, nowIso: "x" });

    assert.deepEqual(snap.removedSeriesIds, ["ss_2"]);
    assert.deepEqual(snap.removedRepGroupIds, ["rg_3", "rg_4"]);
});

test("snapshot recomputes elapsed time from the clock while running", () => {
    const snap = buildResumeSnapshot({
        routineId: "rt_1",
        running: true,
        startEpochMs: 100_000,
        elapsedMs: 5,
        completedRepGroups: new Map(),
    }, { nowMs: 130_000, nowIso: "2026-08-04T10:05:00.000Z" });

    assert.equal(snap.elapsedMs, 30_000);
});

test("snapshot copies sessionSeriesOrder instead of aliasing it", () => {
    const order = [0, 1];
    const snap = buildResumeSnapshot({ routineId: "rt_1", sessionSeriesOrder: order, completedRepGroups: new Map() },
        { nowMs: 0, nowIso: "x" });

    order.push(2);
    assert.deepEqual(snap.sessionSeriesOrder, [0, 1]);
});

test("only snapshots of the same routine holding progress are resumable", () => {
    const withSets = { routineId: "rt_1", elapsedMs: 0, completedRepGroups: [[0, [0]]] };
    const withTime = { routineId: "rt_1", elapsedMs: 8_000, completedRepGroups: [] };
    const untouched = { routineId: "rt_1", elapsedMs: 0, completedRepGroups: [] };

    assert.equal(isResumableFor(withSets, "rt_1"), true);
    assert.equal(isResumableFor(withTime, "rt_1"), true);
    assert.equal(isResumableFor(untouched, "rt_1"), false);
    assert.equal(isResumableFor(withSets, "rt_2"), false);
    assert.equal(isResumableFor(withSets, null), false);
    assert.equal(isResumableFor(null, "rt_1"), false);
});

test("resume keeps the saved cursor when it is still pending", () => {
    const state = { currentSeriesIndex: 1, currentRepGroupIndex: 1, sessionSeriesOrder: [0, 1] };
    const position = resolveResumePosition(state, routine([2, 2]), done([[0, [0, 1]], [1, [0]]]));

    assert.deepEqual({ seriesIdx: position.seriesIdx, repIdx: position.repIdx }, { seriesIdx: 1, repIdx: 1 });
});

test("resume falls back to the first pending set when the saved cursor is done", () => {
    const state = { currentSeriesIndex: 0, currentRepGroupIndex: 0, sessionSeriesOrder: [0, 1] };
    const position = resolveResumePosition(state, routine([2, 2]), done([[0, [0, 1]]]));

    assert.deepEqual({ seriesIdx: position.seriesIdx, repIdx: position.repIdx }, { seriesIdx: 1, repIdx: 0 });
});

test("resume falls back when the saved cursor no longer exists in the routine", () => {
    // Routine was edited down to a single 1-set series after the snapshot was taken.
    const state = { currentSeriesIndex: 4, currentRepGroupIndex: 9, sessionSeriesOrder: [0, 1, 2, 3, 4] };
    const position = resolveResumePosition(state, routine([1]), new Map());

    assert.deepEqual({ seriesIdx: position.seriesIdx, repIdx: position.repIdx }, { seriesIdx: 0, repIdx: 0 });
    assert.deepEqual(position.sessionSeriesOrder, [0]);
});

test("resume on a fully completed routine lands on 0/0 without throwing", () => {
    const state = { currentSeriesIndex: 0, currentRepGroupIndex: 0, sessionSeriesOrder: [0] };
    const position = resolveResumePosition(state, routine([1]), done([[0, [0]]]));

    assert.deepEqual({ seriesIdx: position.seriesIdx, repIdx: position.repIdx }, { seriesIdx: 0, repIdx: 0 });
});
