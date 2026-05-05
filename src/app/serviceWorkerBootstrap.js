export function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
        console.warn("[SW] serviceWorker NOT supported");
        return;
    }

    const isLocalHost =
        location.hostname === "localhost" ||
        location.hostname === "127.0.0.1" ||
        location.hostname === "::1";

    // Local static serving (python/http.server) frequently keeps stale SW caches.
    // Disable SW locally to avoid loading outdated JS/CSS bundles.
    if (isLocalHost) {
        window.addEventListener("load", async () => {
            try {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((reg) => reg.unregister()));

                if ("caches" in window) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map((key) => caches.delete(key)));
                }

                console.log("[SW] disabled on localhost and caches cleared");
            } catch (err) {
                console.warn("[SW] local cleanup failed:", err);
            }
        });
        return;
    }

    console.log("[SW] serviceWorker supported");

    window.addEventListener("load", async () => {
        try {
            const reg = await navigator.serviceWorker.register("/sw.js");
            console.log("[SW] registered:", reg.scope);

            navigator.serviceWorker.ready.then(() => {
                console.log("[SW] ready");
            });

            if (navigator.serviceWorker.controller) {
                console.log("[SW] controller present on first load");
            } else {
                console.log("[SW] controller is NULL on first load");
            }

            navigator.serviceWorker.addEventListener("controllerchange", () => {
                console.log("[SW] controller changed — page now controlled");
            });
        } catch (err) {
            console.error("[SW] registration failed:", err);
        }
    });
}