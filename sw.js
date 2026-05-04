// sw.js

// ── Cache strategy ───────────────────────────────────────────────────────────
// Bump CACHE_VERSION whenever assets change (or use a build hash).
const CACHE_VERSION = "v1";
const CACHE_NAME = `gym-tracker-${CACHE_VERSION}`;

// App-shell files to precache on install.
const PRECACHE_URLS = [
    "/",
    "/styles/base.css",
    "/styles/components/session.css",
    "/src/app.js",
    "/src/router.js",
    "/src/internationalization/i18n.js",
    "/src/internationalization/dicts.js",
    "/manifest.json",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
];

let sessionStartTs = null;
let lastHeartbeatTs = null;

const NOTIFICATION_TAG = "workout-session";
const NOTIFICATION_ICON = "/icons/icon-192.png";
const NOTIFICATION_BADGE = "/icons/icon-192.png";

self.addEventListener("install", () => {
self.addEventListener("install", (event) => {
    console.log("[SW] installed");
    self.skipWaiting();
    // Precache app shell so the first offline visit still works.
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
    );
});

self.addEventListener("activate", (event) => {
    console.log("[SW] activated");
    // Delete stale caches from previous versions.
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

// ── Fetch handler ────────────────────────────────────────────────────────────
// Navigation requests: network-first so users always get fresh HTML; fall back
// to cached "/" for offline SPA support.
// Static assets (JS, CSS, images, fonts): cache-first for fast repeat loads.
self.addEventListener("fetch", (event) => {
    const { request } = event;

    // Only handle same-origin GET requests.
    if (request.method !== "GET") return;
    if (!request.url.startsWith(self.location.origin)) return;

    const url = new URL(request.url);
    const isNavigation = request.mode === "navigate";
    const isStaticAsset = /\.(js|css|png|jpg|jpeg|svg|webp|woff2?|ico|json)(\?|$)/.test(url.pathname);

    if (isNavigation) {
        // Network-first: serve fresh HTML; on failure serve cached home shell.
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Cache successful navigation responses.
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match("/").then((r) => r || Response.error()))
        );
    } else if (isStaticAsset) {
        // Cache-first: serve from cache instantly; update cache in background.
        event.respondWith(
            caches.open(CACHE_NAME).then(async (cache) => {
                const cached = await cache.match(request);
                const networkFetch = fetch(request).then((response) => {
                    if (response.ok) cache.put(request, response.clone());
                    return response;
                }).catch(() => undefined);
                // Return cached immediately if available, otherwise wait for network.
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