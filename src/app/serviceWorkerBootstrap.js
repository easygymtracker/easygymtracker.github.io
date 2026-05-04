export function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
        console.warn("[SW] serviceWorker NOT supported");
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