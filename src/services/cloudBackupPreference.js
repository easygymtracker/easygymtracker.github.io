// services/cloudBackupPreference.js
//
// Remembers only that the user opted into Drive backup, so the UI can offer a
// silent reconnect on the next visit. Access tokens are deliberately NOT stored
// here (or anywhere persistent) — they live in memory for their ~1 h lifetime,
// so a stolen localStorage dump grants no access to the user's Drive.

const STORAGE_KEY = "gymapp_drive_backup_enabled";
const LAST_BACKUP_KEY = "gymapp_drive_backup_last_at";

export function isDriveBackupEnabled() {
    return localStorage.getItem(STORAGE_KEY) === "true";
}

export function setDriveBackupEnabled(enabled) {
    if (enabled) {
        localStorage.setItem(STORAGE_KEY, "true");
    } else {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LAST_BACKUP_KEY);
    }
}

export function getLastDriveBackupAt() {
    return localStorage.getItem(LAST_BACKUP_KEY);
}

export function setLastDriveBackupAt(iso) {
    if (!iso) return;
    localStorage.setItem(LAST_BACKUP_KEY, String(iso));
}
