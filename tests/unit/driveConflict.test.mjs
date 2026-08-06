import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Drive holds a single file that every device PATCHes blindly, so the only thing
// standing between a stale device and someone else's backup is this bookkeeping.

class MemoryStorage {
    constructor() { this.map = new Map(); }
    getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
    setItem(k, v) { this.map.set(k, String(v)); }
    removeItem(k) { this.map.delete(k); }
    clear() { this.map.clear(); }
}
globalThis.localStorage = new MemoryStorage();

const {
    getUnsyncedChangeAt,
    isRemoteRevisionUnknown,
    markDriveSynced,
    markLocalDataChanged,
    setDriveBackupEnabled,
    setLastDriveBackupAt,
} = await import("../../src/services/cloudBackupPreference.js");

const { StorageService } = await import("../../src/storage/storageService.js");

const at = (iso) => new Date(iso);

test.beforeEach(() => globalThis.localStorage.clear());

// --- overwrite protection ----------------------------------------------------

test("no remote backup yet: saving overwrites nothing, so no warning", () => {
    assert.equal(isRemoteRevisionUnknown(null), false);
    assert.equal(isRemoteRevisionUnknown(undefined), false);
});

test("saving over the revision we last synced with is not a conflict", () => {
    markDriveSynced("2026-08-01T10:00:00.000Z", at("2026-08-01T10:00:00Z"));
    assert.equal(isRemoteRevisionUnknown("2026-08-01T10:00:00.000Z"), false);
});

test("another device saved since our last sync: warn before replacing it", () => {
    markDriveSynced("2026-08-01T10:00:00.000Z", at("2026-08-01T10:00:00Z"));
    assert.equal(isRemoteRevisionUnknown("2026-08-03T18:30:00.000Z"), true);
});

test("just connected to an account that already has a backup: warn too", () => {
    // connect() adopts the remote timestamp for display, but this device has
    // never pushed to that file — saving would replace the other device's data.
    setDriveBackupEnabled(true);
    setLastDriveBackupAt("2026-08-01T10:00:00.000Z");

    assert.equal(isRemoteRevisionUnknown("2026-08-01T10:00:00.000Z"), true);
});

test("disconnecting forgets the synced revision, so a reconnect warns again", () => {
    markDriveSynced("2026-08-01T10:00:00.000Z", at("2026-08-01T10:00:00Z"));
    setDriveBackupEnabled(false);

    assert.equal(isRemoteRevisionUnknown("2026-08-01T10:00:00.000Z"), true);
});

// --- the whole mechanism is opt-in ------------------------------------------

test("with Drive off, nothing is tracked and nothing is written", () => {
    markLocalDataChanged(at("2026-08-02T09:00:00Z"));

    assert.equal(globalThis.localStorage.map.size, 0, "a local-only user pays no write");
    assert.equal(getUnsyncedChangeAt(), null);
});

test("connecting starts tracking, with everything on the device unsynced", () => {
    setDriveBackupEnabled(true);
    // Nothing has been pushed yet, so the existing data must count as pending.
    assert.ok(getUnsyncedChangeAt(), "connecting should seed the change marker");
});

test("disconnecting leaves no trace behind", () => {
    setDriveBackupEnabled(true);
    markLocalDataChanged(at("2026-08-02T09:00:00Z"));
    markDriveSynced("2026-08-02T09:05:00.000Z", at("2026-08-02T09:05:00Z"));

    setDriveBackupEnabled(false);
    assert.equal(globalThis.localStorage.map.size, 0, [...globalThis.localStorage.map.keys()].join());

    // ...and it stays quiet afterwards.
    markLocalDataChanged(at("2026-08-03T09:00:00Z"));
    assert.equal(globalThis.localStorage.map.size, 0);
});

test("a build with no Drive client ID never installs the write hook", () => {
    const services = readFileSync("src/services/services.js", "utf8");
    assert.match(services, /onWrite:\s*isGoogleDriveConfigured\(\)\s*\?\s*markLocalDataChanged/);
});

// --- unsynced local work -----------------------------------------------------

test("a device that never synced counts all its data as unsynced", () => {
    setDriveBackupEnabled(true);
    markLocalDataChanged(at("2026-08-02T09:00:00Z"));
    assert.equal(getUnsyncedChangeAt(), "2026-08-02T09:00:00.000Z");
});

test("saving clears the unsynced flag; editing afterwards sets it again", () => {
    setDriveBackupEnabled(true);
    markLocalDataChanged(at("2026-08-02T09:00:00Z"));
    markDriveSynced("2026-08-02T09:05:00.000Z", at("2026-08-02T09:05:00Z"));
    assert.equal(getUnsyncedChangeAt(), null);

    markLocalDataChanged(at("2026-08-02T11:00:00Z"));
    assert.equal(getUnsyncedChangeAt(), "2026-08-02T11:00:00.000Z");
});

test("an edit made mid-upload is not swallowed by the save", () => {
    setDriveBackupEnabled(true);
    // saveNow stamps the sync with the time it *started*, before snapshotting.
    const startedAt = at("2026-08-02T09:00:00Z");
    markLocalDataChanged(at("2026-08-02T09:00:30Z")); // user edits while it uploads
    markDriveSynced("2026-08-02T09:01:00.000Z", startedAt);

    assert.equal(getUnsyncedChangeAt(), "2026-08-02T09:00:30.000Z");
});

test("comparison survives a month/year rollover", () => {
    setDriveBackupEnabled(true);
    // The two stamps are compared as strings; ISO makes that chronological.
    markDriveSynced("x", at("2026-12-31T23:59:59Z"));
    markLocalDataChanged(at("2027-01-01T00:00:01Z"));
    assert.equal(getUnsyncedChangeAt(), "2027-01-01T00:00:01.000Z");

    markDriveSynced("x", at("2027-01-02T00:00:00Z"));
    assert.equal(getUnsyncedChangeAt(), null);
});

// --- the flag is actually fed by real writes ---------------------------------

function makeStorage(onWrite) {
    const map = new Map();
    const adapter = {
        get: (k) => (map.has(k) ? map.get(k) : null),
        set: (k, v) => map.set(k, v),
        remove: (k) => map.delete(k),
        keys: () => [...map.keys()],
    };
    const serializer = { serialize: JSON.stringify, deserialize: JSON.parse };
    return new StorageService(adapter, serializer, { onWrite });
}

test("every kind of storage mutation marks the device changed", () => {
    let writes = 0;
    const storage = makeStorage(() => { writes += 1; });

    storage.set("a", { v: 1 });
    assert.equal(writes, 1);

    storage.remove("a");
    assert.equal(writes, 2);

    // restoreSnapshot writes through the adapter directly, bypassing set().
    storage.restoreSnapshot({ b: '{"v":2}' }, { clear: true });
    assert.equal(writes, 3);
});

test("reads never mark the device changed", () => {
    let writes = 0;
    const storage = makeStorage(() => { writes += 1; });
    storage.set("a", { v: 1 });

    storage.get("a");
    storage.keys();
    storage.snapshot();

    assert.equal(writes, 1);
});

test("a throwing observer cannot break a write", () => {
    const storage = makeStorage(() => { throw new Error("quota"); });
    storage.set("a", { v: 1 });
    assert.deepEqual(storage.get("a"), { v: 1 });
});

test("the app's storage is wired to the change marker", () => {
    const services = readFileSync("src/services/services.js", "utf8");
    assert.match(services, /onWrite:.*markLocalDataChanged/);
});

// --- the UI actually consults all of this ------------------------------------

const section = readFileSync("src/pages/profilePage/backupSection.js", "utf8");

test("the save button checks the remote revision before uploading", () => {
    const handler = section.slice(section.indexOf("saveBtn?.addEventListener"));
    const guard = handler.indexOf("isRemoteRevisionUnknown");
    const upload = handler.indexOf("saveBackupToDrive");

    assert.ok(guard !== -1, "save path must check the remote revision");
    assert.ok(guard < upload, "the check must happen before the upload");
});

test("restore prompts with the backup's own date and warns about local work", () => {
    assert.match(section, /backup\.confirm\.restoreDated/);
    assert.match(section, /backup\.warn\.localNewer/);
    // Both restore paths (Drive and file) go through the same prompt.
    assert.equal(section.match(/confirmRestore\(/g)?.length, 3); // 1 definition + 2 call sites
});

test("a Drive restore records the revision it restored", () => {
    // Otherwise the device stays 'behind' and the next save falsely warns.
    assert.match(section, /markDriveSynced\(driveModifiedTime\)/);
    assert.match(section, /driveModifiedTime: result\.modifiedTime/);
});

test("a file restore is not passed off as a Drive sync", () => {
    const handler = section.slice(
        section.indexOf("importFileInput?.addEventListener"),
        section.indexOf("// --- optional Google Drive copy"),
    );
    assert.doesNotMatch(handler, /markDriveSynced|driveModifiedTime/);
});

// --- localisation ------------------------------------------------------------

test("every language ships the conflict wording", async () => {
    const { DICTS } = await import("../../src/internationalization/dicts.js");
    const keys = [
        "backup.status.pendingChanges",
        "backup.confirm.restoreDated",
        "backup.confirm.overwriteRemote",
        "backup.warn.localNewer",
    ];

    for (const [lang, dict] of Object.entries(DICTS)) {
        for (const key of keys) {
            assert.ok(dict[key], `${lang} is missing ${key}`);
            assert.ok(dict[key].includes("{when}"), `${lang}/${key} lost its {when} placeholder`);
            // A key echoed back as its own name means the lookup silently failed.
            assert.notEqual(dict[key], key);
        }
    }
});
