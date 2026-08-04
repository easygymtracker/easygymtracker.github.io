import test from "node:test";
import assert from "node:assert/strict";

// services.js talks to localStorage, so a stub must exist before it is imported.
class MemoryStorage {
    constructor() { this.map = new Map(); }
    get length() { return this.map.size; }
    key(i) { return [...this.map.keys()][i] ?? null; }
    getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
    setItem(k, v) { this.map.set(k, String(v)); }
    removeItem(k) { this.map.delete(k); }
    clear() { this.map.clear(); }
}
globalThis.localStorage = new MemoryStorage();

const { createWorkoutSessionStore } = await import("../../src/store/workoutSessionStore.js");

function freshStore() {
    globalThis.localStorage.clear();
    return createWorkoutSessionStore();
}

const snapshot = (over = {}) => ({
    sessionId: "ws_1",
    routineId: "rt_1",
    startedAtIso: "2026-08-04T10:00:00.000Z",
    elapsedMs: 12_000,
    currentSeriesIndex: 0,
    currentRepGroupIndex: 1,
    sessionSeriesOrder: [0, 1],
    completedRepGroups: [[0, [0]]],
    updatedAt: "2026-08-04T10:00:12.000Z",
    ...over,
});

test("no active state by default", () => {
    assert.equal(freshStore().getActiveState(), null);
});

test("active state round trips through storage", () => {
    const store = freshStore();
    store.setActiveState(snapshot());

    const read = store.getActiveState();
    assert.equal(read.sessionId, "ws_1");
    assert.equal(read.routineId, "rt_1");
    assert.equal(read.elapsedMs, 12_000);
    assert.equal(read.startedAtIso, "2026-08-04T10:00:00.000Z");
    assert.deepEqual(read.completedRepGroups, [[0, [0]]]);
    assert.deepEqual(read.sessionSeriesOrder, [0, 1]);
});

test("setActiveState overwrites instead of appending", () => {
    const store = freshStore();
    store.setActiveState(snapshot());
    store.setActiveState(snapshot({ elapsedMs: 30_000, completedRepGroups: [[0, [0, 1]]] }));

    assert.equal(store.getActiveState().elapsedMs, 30_000);
    assert.deepEqual(store.getActiveState().completedRepGroups, [[0, [0, 1]]]);
});

test("setActiveState ignores non-object input", () => {
    const store = freshStore();
    store.setActiveState(snapshot());
    store.setActiveState(null);
    store.setActiveState("nope");

    assert.equal(store.getActiveState().sessionId, "ws_1");
});

test("clearActiveState removes it", () => {
    const store = freshStore();
    store.setActiveState(snapshot());
    store.clearActiveState();

    assert.equal(store.getActiveState(), null);
});

test("clearAll drops entries and active state together", () => {
    const store = freshStore();
    store.addSession({ routineId: "rt_1", isCompleted: false });
    store.setActiveState(snapshot());

    store.clearAll();

    assert.deepEqual(store.listSessions(), []);
    assert.equal(store.getActiveState(), null);
});

test("resuming updates the same entry instead of creating a duplicate", () => {
    const store = freshStore();
    const created = store.addSession({ routineId: "rt_1", isCompleted: false, totals: { sets: 1 } });

    const updated = store.updateSession(created.id, { isCompleted: true, totals: { sets: 3 } });

    assert.equal(store.listSessions().length, 1);
    assert.equal(updated.id, created.id);
    assert.equal(updated.isCompleted, true);
    assert.equal(updated.totals.sets, 3);
    assert.equal(updated.createdAt, created.createdAt);
});

test("updateSession returns null for an unknown id (caller re-creates)", () => {
    const store = freshStore();
    assert.equal(store.updateSession("ws_missing", { isCompleted: true }), null);
});

test("an unfinished session is persisted with isCompleted false and survives a reload", () => {
    const store = freshStore();
    store.addSession({ routineId: "rt_1", isCompleted: false });

    // A new store instance models a page reload against the same storage.
    const reloaded = createWorkoutSessionStore().listSessions();
    assert.equal(reloaded.length, 1);
    assert.equal(reloaded[0].isCompleted, false);
});
