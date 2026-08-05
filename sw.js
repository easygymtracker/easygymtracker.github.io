// sw.js

// Cache strategy
// Bump CACHE_VERSION whenever assets change.
const CACHE_VERSION = "v14";
const CACHE_NAME = `gym-tracker-${CACHE_VERSION}`;

// App-shell files to precache on install.
const PRECACHE_URLS = [
    "/",
    "/styles/base.css",
    "/styles/components/session.css",
    "/styles/components/routines.css",
    "/styles/components/landing.css",
    "/src/app.js",
    "/src/app/styleRouter.js",
    "/src/router.js",
    "/src/internationalization/i18n.js",
    "/src/internationalization/dicts.js",
    "/manifest.json",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/assets/favicon.png",
    "/assets/favicon_bg.png",
];

let sessionStartTs = null;
let lastHeartbeatTs = null;

const NOTIFICATION_TAG = "workout-session";
const NOTIFICATION_ICON = "/assets/favicon_bg.png";
const NOTIFICATION_BADGE = "/assets/favicon_bg.png";
const NOTIFICATION_IMAGE = "/assets/favicon_bg.png";
const NOTIFICATION_COLOR = "#1e1e1e";

const IS_LOCALHOST =
    self.location.hostname === "localhost" ||
    self.location.hostname === "127.0.0.1" ||
    self.location.hostname === "::1";

self.addEventListener("install", (event) => {
    console.log("[SW] installed");
    self.skipWaiting();
    // Skip precaching on localhost to avoid stale bundles.
    if (!IS_LOCALHOST) {
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
        );
    }
});

self.addEventListener("activate", (event) => {
    console.log("[SW] activated");
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((k) => k.startsWith("gym-tracker-") && k !== CACHE_NAME)
                    .map((k) => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// Navigation requests: network-first.
// Static assets: cache-first.
// Skip all caching on localhost to avoid stale bundles.
self.addEventListener("fetch", (event) => {
    if (IS_LOCALHOST) return;

    const { request } = event;

    if (request.method !== "GET") return;
    if (!request.url.startsWith(self.location.origin)) return;

    const url = new URL(request.url);
    const isNavigation = request.mode === "navigate";
    const isStaticAsset = /\.(js|css|png|jpg|jpeg|svg|webp|woff2?|ico|json)(\?|$)/.test(url.pathname);

    if (isNavigation) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match("/").then((r) => r || Response.error()))
        );
    } else if (isStaticAsset) {
        event.respondWith(
            caches.open(CACHE_NAME).then(async (cache) => {
                const cached = await cache.match(request);
                const networkFetch = fetch(request).then((response) => {
                    if (response.ok) cache.put(request, response.clone());
                    return response;
                }).catch(() => undefined);

                return cached ?? networkFetch;
            })
        );
    }
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
            break;
        }

        case "SESSION_END": {
            sessionStartTs = null;
            lastHeartbeatTs = null;

            self.registration.getNotifications({ tag: NOTIFICATION_TAG })
                .then((notifications) => {
                    notifications.forEach((n) => n.close());
                });

            console.log("[SW] session ended");
            break;
        }
    }
});

self.addEventListener("notificationclick", (event) => {
    const action = event.action;
    const targetUrl = event.notification?.data?.url || "/";
    event.notification.close();

    event.waitUntil(
        (async () => {
            const clientsList = await self.clients.matchAll({
                type: "window",
                includeUncontrolled: true,
            });

            let client = clientsList[0];
            if (!client) {
                client = await self.clients.openWindow(targetUrl);
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
        color: NOTIFICATION_COLOR,
        vibrate: restRunning ? [80] : [120, 60, 120],
        timestamp: Date.now(),
        data: {
            url: "/",
            source: "session-notification",
        },
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