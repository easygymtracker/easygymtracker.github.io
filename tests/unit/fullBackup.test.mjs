import test from "node:test";
import assert from "node:assert/strict";

import { LocalStorageAdapter } from "../../src/storage/localStorageAdapter.js";
import { JsonSerializer } from "../../src/storage/jsonSerializer.js";
import { StorageService } from "../../src/storage/storageService.js";
import {
    buildFullBackupV1,
    fullBackupFilename,
    parseFullBackup,
    restoreFullBackup,
} from "../../src/export/fullBackup.js";

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

function freshStorage() {
    globalThis.localStorage.clear();
    return new StorageService(new LocalStorageAdapter("gymapp_v1"), new JsonSerializer({ schemaVersion: 1 }));
}

test("snapshot captures every key in the namespace", () => {
    const storage = freshStorage();
    storage.set("routines:index", ["rt_1"]);
    storage.set("profile:entries", [{ recordedAt: "2026-08-04T10:00:00.000Z", weightKg: 80 }]);

    const snap = storage.snapshot();
    assert.deepEqual(Object.keys(snap).sort(), ["profile:entries", "routines:index"]);
    assert.equal(typeof snap["routines:index"], "string");
});

test("snapshot ignores keys outside the namespace", () => {
    const storage = freshStorage();
    storage.set("routines:index", ["rt_1"]);
    globalThis.localStorage.setItem("some_other_app:stuff", "nope");
    globalThis.localStorage.setItem("gymapp_notifications_enabled", "false");

    assert.deepEqual(Object.keys(storage.snapshot()), ["routines:index"]);
});

test("a backup round trips byte-for-byte through build and restore", () => {
    const storage = freshStorage();
    storage.set("routines:index", ["rt_1"]);
    storage.set("routines:rt_1", { type: "Routine", id: "rt_1", name: "Push day" });

    const backup = buildFullBackupV1({ storage });
    const before = storage.snapshot();

    globalThis.localStorage.clear();
    assert.deepEqual(storage.snapshot(), {});

    restoreFullBackup({ parsed: backup, storage });
    assert.deepEqual(storage.snapshot(), before);
    assert.equal(storage.get("routines:rt_1").name, "Push day");
});

test("restore also works from the serialized JSON string", () => {
    const storage = freshStorage();
    storage.set("routines:index", ["rt_1"]);
    const json = JSON.stringify(buildFullBackupV1({ storage }));

    globalThis.localStorage.clear();
    restoreFullBackup({ parsed: json, storage });

    assert.deepEqual(storage.get("routines:index"), ["rt_1"]);
});

test("restore is destructive: keys absent from the backup are dropped", () => {
    const storage = freshStorage();
    storage.set("routines:index", ["rt_1"]);
    const backup = buildFullBackupV1({ storage });

    // Simulates a routine created after the backup was taken.
    storage.set("routines:rt_later", { type: "Routine", id: "rt_later", name: "Later" });
    assert.equal(storage.get("routines:rt_later").name, "Later");

    restoreFullBackup({ parsed: backup, storage });
    assert.equal(storage.get("routines:rt_later"), null);
    assert.deepEqual(storage.get("routines:index"), ["rt_1"]);
});

test("a destructive restore leaves out-of-namespace preferences alone", () => {
    const storage = freshStorage();
    storage.set("routines:index", ["rt_1"]);
    const backup = buildFullBackupV1({ storage });

    // Preference flags live outside gymapp_v1: on purpose, so restoring a backup
    // does not sign the user out of Drive or re-trigger the onboarding tour.
    globalThis.localStorage.setItem("gymapp_drive_backup_enabled", "true");
    globalThis.localStorage.setItem("gymapp_onboarding_tour_seen", "true");
    globalThis.localStorage.setItem("lang", "es");

    restoreFullBackup({ parsed: backup, storage });

    assert.equal(globalThis.localStorage.getItem("gymapp_drive_backup_enabled"), "true");
    assert.equal(globalThis.localStorage.getItem("gymapp_onboarding_tour_seen"), "true");
    assert.equal(globalThis.localStorage.getItem("lang"), "es");
});

test("backup metadata records the format, version and entry count", () => {
    const storage = freshStorage();
    storage.set("routines:index", ["rt_1"]);
    storage.set("profile:entries", []);

    const backup = buildFullBackupV1({ storage, now: new Date("2026-08-04T10:00:00.000Z") });
    assert.equal(backup.format, "GymAppFullBackup");
    assert.equal(backup.formatVersion, 1);
    assert.equal(backup.exportedAt, "2026-08-04T10:00:00.000Z");
    assert.equal(backup.app.storageNamespace, "gymapp_v1");
    assert.equal(backup.entryCount, 2);
});

test("parseFullBackup rejects anything that is not a matching backup", () => {
    assert.throws(() => parseFullBackup(null), /Invalid backup/);
    assert.throws(() => parseFullBackup({ format: "SomethingElse", formatVersion: 1, entries: {} }), /Unsupported backup format/);
    assert.throws(() => parseFullBackup({ format: "GymAppFullBackup", formatVersion: 99, entries: {} }), /Unsupported backup version/);
    assert.throws(() => parseFullBackup({ format: "GymAppFullBackup", formatVersion: 1 }), /missing its entries/);
    assert.throws(() => parseFullBackup({ format: "GymAppFullBackup", formatVersion: 1, entries: [] }), /missing its entries/);
});

test("parseFullBackup accepts a routine export being mistaken for a backup by refusing it", () => {
    const routineExport = { format: "GymAppRoutineExport", formatVersion: 1, routine: {} };
    assert.throws(() => parseFullBackup(routineExport), /Unsupported backup format/);
});

test("restoreSnapshot skips non-string values instead of corrupting storage", () => {
    const storage = freshStorage();
    const written = storage.restoreSnapshot({
        "routines:index": JSON.stringify({ __meta: { schemaVersion: 1 }, payload: ["rt_1"] }),
        "routines:bogus": { not: "a string" },
        "routines:alsoBogus": 42,
    });

    assert.equal(written, 1);
    assert.deepEqual(storage.get("routines:index"), ["rt_1"]);
    assert.equal(globalThis.localStorage.getItem("gymapp_v1:routines:bogus"), null);
});

test("backup filename is dated and uses the backup extension", () => {
    assert.equal(fullBackupFilename(new Date("2026-08-04T10:00:00.000Z")),
        "gym-tracker-backup-2026-08-04.gymbackup.json");
});
