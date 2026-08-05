import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
    constructor() { this.map = new Map(); }
    getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
    setItem(k, v) { this.map.set(k, String(v)); }
    removeItem(k) { this.map.delete(k); }
    clear() { this.map.clear(); }
    has(k) { return this.map.has(k); }
}
globalThis.localStorage = new MemoryStorage();

const {
    isDriveBackupEnabled,
    setDriveBackupEnabled,
    getLastDriveBackupAt,
    setLastDriveBackupAt,
} = await import("../../src/services/cloudBackupPreference.js");

const { GOOGLE_DRIVE_SCOPE } = await import("../../src/config/googleDrive.js");

test("Drive backup is opt-in: disabled until explicitly enabled", () => {
    globalThis.localStorage.clear();
    assert.equal(isDriveBackupEnabled(), false);

    setDriveBackupEnabled(true);
    assert.equal(isDriveBackupEnabled(), true);
});

test("disabling clears the remembered last-backup timestamp too", () => {
    globalThis.localStorage.clear();
    setDriveBackupEnabled(true);
    setLastDriveBackupAt("2026-08-04T10:00:00.000Z");
    assert.equal(getLastDriveBackupAt(), "2026-08-04T10:00:00.000Z");

    setDriveBackupEnabled(false);
    assert.equal(isDriveBackupEnabled(), false);
    assert.equal(getLastDriveBackupAt(), null);
});

test("setLastDriveBackupAt ignores empty values", () => {
    globalThis.localStorage.clear();
    setLastDriveBackupAt(null);
    setLastDriveBackupAt("");
    assert.equal(getLastDriveBackupAt(), null);
});

test("no access token is ever persisted to storage", () => {
    globalThis.localStorage.clear();
    setDriveBackupEnabled(true);
    setLastDriveBackupAt("2026-08-04T10:00:00.000Z");

    const persisted = [...globalThis.localStorage.map.entries()];
    for (const [key, value] of persisted) {
        assert.doesNotMatch(key.toLowerCase(), /token|secret|bearer/);
        assert.doesNotMatch(String(value).toLowerCase(), /^ya29\.|bearer /);
    }
});

// The "unconfigured -> never offer Drive" rule lives in driveNotConfigured.test.mjs,
// which stays green whether or not a deployment has pasted in a client ID.

test("the configured scope is the per-file one, not full Drive access", () => {
    assert.equal(GOOGLE_DRIVE_SCOPE, "https://www.googleapis.com/auth/drive.file");
});
