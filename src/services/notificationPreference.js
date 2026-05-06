const STORAGE_KEY = "gymapp_notifications_enabled";

export function areNotificationsEnabled() {
    const val = localStorage.getItem(STORAGE_KEY);
    return val !== "false";
}

export function setNotificationsEnabled(enabled) {
    localStorage.setItem(STORAGE_KEY, String(!!enabled));
}
