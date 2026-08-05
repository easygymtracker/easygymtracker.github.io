// services/sessionNotifications.js
//
// Talking to the service worker about the live session notification. The
// notification is shown with requireInteraction: true, so it stays on screen
// until something explicitly closes it — stopping the updates is not enough.

export function clearSessionNotification() {
    if (!navigator.serviceWorker?.controller) return;
    navigator.serviceWorker.controller.postMessage({ type: "SESSION_END" });
}
