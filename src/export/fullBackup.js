// src/export/fullBackup.js
//
// Whole-app backup: a raw snapshot of the app's storage namespace (routines,
// exercises, profile measurements, workout history, in-progress session).
//
// Unlike the per-routine / per-profile exports — which are *portable* formats
// that drop device-local ids — this is a faithful device backup meant to be
// restored into the same app, so it keeps the storage representation as-is.

export const FULL_BACKUP_FORMAT = "GymAppFullBackup";
export const FULL_BACKUP_VERSION = 1;

export function buildFullBackupV1({ storage, storageNamespace = "gymapp_v1", now = new Date() }) {
    if (!storage?.snapshot) throw new Error("buildFullBackupV1: storage with snapshot() is required");

    const entries = storage.snapshot();

    return {
        format: FULL_BACKUP_FORMAT,
        formatVersion: FULL_BACKUP_VERSION,
        exportedAt: now.toISOString(),
        app: {
            name: "Easy Gym Routine Tracker",
            storageNamespace,
        },
        entryCount: Object.keys(entries).length,
        entries,
    };
}

/** Accepts a JSON string or an already-parsed object. Throws on anything unusable. */
export function parseFullBackup(input) {
    const parsed = typeof input === "string" ? JSON.parse(input) : input;

    if (!parsed || typeof parsed !== "object") throw new Error("Invalid backup contents");
    if (parsed.format !== FULL_BACKUP_FORMAT) throw new Error("Unsupported backup format");
    if (parsed.formatVersion !== FULL_BACKUP_VERSION) throw new Error("Unsupported backup version");

    const entries = parsed.entries;
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
        throw new Error("Backup is missing its entries");
    }

    return parsed;
}

/**
 * Replaces local data with the backup. Destructive by design: a restore that
 * merged would leave deleted routines resurrected and duplicated history.
 */
export function restoreFullBackup({ parsed, storage }) {
    const backup = parseFullBackup(parsed);
    if (!storage?.restoreSnapshot) throw new Error("restoreFullBackup: storage with restoreSnapshot() is required");

    return storage.restoreSnapshot(backup.entries, { clear: true });
}

export function fullBackupFilename(now = new Date()) {
    return `gym-tracker-backup-${now.toISOString().slice(0, 10)}.gymbackup.json`;
}

export function downloadFullBackup({ data, filename = fullBackupFilename() }) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 0);
}
