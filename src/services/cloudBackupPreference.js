// services/cloudBackupPreference.js
//
// Remembers only that the user opted into Drive backup, so the UI can offer a
// silent reconnect on the next visit. Access tokens are deliberately NOT stored
// here (or anywhere persistent) — they live in memory for their ~1 h lifetime,
// so a stolen localStorage dump grants no access to the user's Drive.
//
// It also tracks just enough to notice a conflict: the Drive revision we last
// synced with, and whether this device has changed anything since.
//
// Two clocks are in play and they are never compared with each other:
//   - LAST_BACKUP_KEY holds Drive's own modifiedTime, only ever compared to
//     another Drive modifiedTime, by string equality. Immune to device clock skew.
//   - SYNCED_LOCAL_AT_KEY / DATA_CHANGED_AT_KEY are both device-clock stamps and
//     are only compared to each other.
//
// These keys live outside the "gymapp_v1" namespace on purpose: restoring a
// backup wipes that namespace, and it must not sign the user out of Drive.

const STORAGE_KEY = "gymapp_drive_backup_enabled";
const LAST_BACKUP_KEY = "gymapp_drive_backup_last_at";
const SYNCED_LOCAL_AT_KEY = "gymapp_drive_synced_local_at";
const DATA_CHANGED_AT_KEY = "gymapp_data_changed_at";

export function isDriveBackupEnabled() {
    return localStorage.getItem(STORAGE_KEY) === "true";
}

export function setDriveBackupEnabled(enabled) {
    if (enabled) {
        localStorage.setItem(STORAGE_KEY, "true");
        // Tracking only starts here, and nothing on this device has been pushed
        // yet — so everything currently stored counts as unsynced.
        markLocalDataChanged();
    } else {
        // Leave no residue: a user who turns Drive off is back to local-only.
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LAST_BACKUP_KEY);
        localStorage.removeItem(SYNCED_LOCAL_AT_KEY);
        localStorage.removeItem(DATA_CHANGED_AT_KEY);
    }
}

/** Drive's modifiedTime for the backup revision this device last saved or restored. */
export function getLastDriveBackupAt() {
    return localStorage.getItem(LAST_BACKUP_KEY);
}

export function setLastDriveBackupAt(iso) {
    if (!iso) return;
    localStorage.setItem(LAST_BACKUP_KEY, String(iso));
}

/**
 * Called on every write to app storage; see services.js.
 *
 * No-op until Drive is actually connected: this stamp exists solely to compare
 * against a cloud copy, so a local-only user must not pay a write for it. The
 * enabled flag is re-read rather than cached so a second tab connecting Drive
 * cannot leave this one silently untracked.
 */
export function markLocalDataChanged(now = new Date()) {
    if (!isDriveBackupEnabled()) return;
    localStorage.setItem(DATA_CHANGED_AT_KEY, now.toISOString());
}

export function getLocalDataChangedAt() {
    return localStorage.getItem(DATA_CHANGED_AT_KEY);
}

/**
 * Records that local data and the given Drive revision are now identical.
 * Call it after a successful save *or* restore — both make the two agree.
 */
export function markDriveSynced(remoteModifiedTime, now = new Date()) {
    setLastDriveBackupAt(remoteModifiedTime);
    localStorage.setItem(SYNCED_LOCAL_AT_KEY, now.toISOString());
}

/**
 * True when saving would replace a Drive revision this device has never seen.
 *
 * Covers both ways that happens: another device saved since our last sync, and
 * the "just connected to an account that already has a backup" case, where the
 * remote revision is known but this device has never pushed to it.
 */
export function isRemoteRevisionUnknown(remoteModifiedTime) {
    if (!remoteModifiedTime) return false; // No remote file: nothing to overwrite.
    if (!localStorage.getItem(SYNCED_LOCAL_AT_KEY)) return true;
    return String(remoteModifiedTime) !== getLastDriveBackupAt();
}

/**
 * ISO stamp of the local edit that is not in the Drive copy yet, or null when
 * this device has nothing new. Used to warn before a restore throws work away.
 */
export function getUnsyncedChangeAt() {
    const changedAt = localStorage.getItem(DATA_CHANGED_AT_KEY);
    if (!changedAt) return null;

    const syncedAt = localStorage.getItem(SYNCED_LOCAL_AT_KEY);
    // Never synced -> everything on this device is unsynced.
    if (!syncedAt) return changedAt;

    // Both come from toISOString(): fixed-width UTC, so > compares chronologically.
    return changedAt > syncedAt ? changedAt : null;
}
