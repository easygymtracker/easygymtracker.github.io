// sw.js

let sessionStartTs = null;
let lastHeartbeatTs = null;

const NOTIFICATION_TAG = "workout-session";
const NOTIFICATION_ICON = "/icons/icon-192.png";
const NOTIFICATION_BADGE = "/icons/icon-192.png";

// -----------------------------------------------------------------------------
// Install
// -----------------------------------------------------------------------------
self.addEventListener("install", () => {
    console.log("[SW] installed");
    self.skipWaiting();
});

// -----------------------------------------------------------------------------
// Activate
// -----------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
    console.log("[SW] activated");
    event.waitUntil(self.clients.claim());
});

// -----------------------------------------------------------------------------
// Message handling
// -----------------------------------------------------------------------------
self.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || !data.type) return;

    switch (data.type) {

        // -------------------------------------------------------------
        // Explicit notification trigger (manual / test)
        // -------------------------------------------------------------
        case "SHOW_NOTIFICATION": {
            showOrUpdateNotification({
                title: data.title || "Workout",
                body: data.body || "",
            });
            break;
        }

        // -------------------------------------------------------------
        // App heartbeat (periodic)
        // -------------------------------------------------------------
        case "APP_HEARTBEAT": {
            lastHeartbeatTs = data.timestamp || Date.now();

            if (!sessionStartTs) {
                sessionStartTs = lastHeartbeatTs;
                console.log("[SW] session started");
            }

            const elapsedMs = lastHeartbeatTs - sessionStartTs;
            const timeLabel = formatElapsed(elapsedMs);

            showOrUpdateNotification({
                title: "Workout in progress",
                body: `Elapsed time: ${timeLabel}`,
            });

            break;
        }

        // -------------------------------------------------------------
        // Optional: explicit session end
        // -------------------------------------------------------------
        case "SESSION_END": {
            sessionStartTs = null;
            lastHeartbeatTs = null;

            self.registration.getNotifications({ tag: NOTIFICATION_TAG })
                .then((notifications) => {
                    notifications.forEach(n => n.close());
                });

            console.log("[SW] session ended");
            break;
        }
    }
});

// -----------------------------------------------------------------------------
// Notification click
// -----------------------------------------------------------------------------
self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true })
            .then((clients) => {
                if (clients.length > 0) {
                    clients[0].focus();
                } else {
                    self.clients.openWindow("/");
                }
            })
    );
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function showOrUpdateNotification({ title, body }) {
    self.registration.showNotification(title, {
        body,
        tag: NOTIFICATION_TAG,        // <-- ensures update, not stack
        renotify: true,
        requireInteraction: true,
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_BADGE,
    });
}

function formatElapsed(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}