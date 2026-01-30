// sw.js

let sessionStartTs = null;
let lastHeartbeatTs = null;

const NOTIFICATION_TAG = "workout-session";
const NOTIFICATION_ICON = "/icons/icon-192.png";
const NOTIFICATION_BADGE = "/icons/icon-192.png";

self.addEventListener("install", () => {
    console.log("[SW] installed");
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    console.log("[SW] activated");
    event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || !data.type) return;

    switch (data.type) {

        case "SESSION_UPDATE": {
            showOrUpdateNotification({
                title: data.payload?.title ?? "Workout session",
                body: data.payload?.body ?? "",
                restRunning: data.payload?.restRunning || false,
                actionTitle: data.payload?.actionTitle,
            });
            break;
        }

        case "SHOW_NOTIFICATION": {
            showOrUpdateNotification({
                title: data.title || "Workout",
                body: data.body || "",
                restRunning: data.restRunning || false,
                actionTitle: data.actionTitle,
            });
            break;
        }

        case "APP_HEARTBEAT": {
            lastHeartbeatTs = data.timestamp || Date.now();
            // Heartbeat is informational only — no notifications here
            break;
        }

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

self.addEventListener("notificationclick", (event) => {
    const action = event.action;
    event.notification.close();

    event.waitUntil(
        (async () => {
            const clientsList = await self.clients.matchAll({
                type: "window",
                includeUncontrolled: true,
            });

            let client = clientsList[0];
            if (!client) {
                client = await self.clients.openWindow("/");
            } else {
                await client.focus();
            }

            if (action === "COMPLETE_SET") {
                client.postMessage({
                    type: "NOTIFICATION_COMPLETE_SET",
                });
            }
        })()
    );
});

function showOrUpdateNotification({ title, body, restRunning = false, actionTitle }) {
    self.registration.showNotification(title, {
        body,
        tag: NOTIFICATION_TAG,
        renotify: true,
        requireInteraction: true,
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_BADGE,
        actions: restRunning
            ? []
            : [
                {
                    action: "COMPLETE_SET",
                    title: actionTitle || "Set done",
                },
            ],
    });
}

function formatElapsed(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}