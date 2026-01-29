/* /public/sw.js */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());

let lastPayload = null;

self.addEventListener("message", (event) => {
    const { type, payload } = event.data || {};

    if (type === "SESSION_UPDATE") {
        lastPayload = payload;

        self.registration.showNotification(payload.title, {
            body: payload.body,
            tag: "active-session",
            renotify: false,
            silent: false,
            renotify: false,
            icon: "/icons/icon-192.png",
            badge: "/icons/badge.png",
            actions: payload.restRunning
                ? [{ action: "skip-rest", title: "Skip rest" }]
                : [],
        });
    }

    if (type === "SESSION_END") {
        self.registration.getNotifications({ tag: "active-session" })
            .then(n => n.forEach(notif => notif.close()));
        lastPayload = null;
    }

    console.log("SW received message:", payload);
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    if (event.action === "skip-rest") {
        event.waitUntil(
            self.clients.matchAll({ type: "window" }).then(clients => {
                clients.forEach(c =>
                    c.postMessage({ type: "SKIP_REST" })
                );
            })
        );
        return;
    }

    event.waitUntil(
        self.clients.matchAll({ type: "window" }).then(clients => {
            if (clients.length) {
                clients[0].focus();
            } else {
                self.clients.openWindow("/");
            }
        })
    );
});