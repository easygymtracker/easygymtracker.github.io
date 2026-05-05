// app/styleRouter.js
//
// Lazy style loader: only fetches a route's CSS when the route is first
// visited instead of prewarming every stylesheet at boot.  Previously loaded
// sheets are cached in-memory and toggled via `media` on subsequent visits.

export function createStyleRouter({ routeToStyles = {}, resolveFrom = import.meta.url } = {}) {
    // href → <link> element (only created once per unique href)
    const linkByHref = new Map();

    // Pre-index: resolve every relative path once at init.
    // routeHrefs: Map<routeName, Set<absoluteHref>>
    // allHrefs:   Set<absoluteHref>
    const routeHrefs = new Map();
    const allHrefs = new Set();

    for (const [route, paths] of Object.entries(routeToStyles)) {
        const resolved = new Set();
        for (const p of Array.isArray(paths) ? paths : []) {
            const href = new URL(p, resolveFrom).href;
            resolved.add(href);
            allHrefs.add(href);
        }
        routeHrefs.set(route, resolved);
    }

    // Adopt <link> elements already in the HTML so we never create duplicates.
    for (const el of document.head.querySelectorAll('link[data-style-router="true"][rel="stylesheet"]')) {
        if (allHrefs.has(el.href)) {
            linkByHref.set(el.href, el);
        }
    }

    // Remove preload hints from the HTML — they were only useful before we
    // switched to lazy loading.  Keeping them causes wasted bandwidth for
    // routes the user may never visit.
    for (const el of document.head.querySelectorAll('link[data-style-router-preload="true"]')) {
        el.remove();
    }

    function ensureLink(href) {
        let el = linkByHref.get(href);
        if (el) return el;

        el = document.createElement("link");
        el.rel = "stylesheet";
        el.href = href;
        el.media = "not all";            // hidden until activated
        el.setAttribute("data-style-router", "true");
        document.head.appendChild(el);
        linkByHref.set(href, el);
        return el;
    }

    function apply(routeName) {
        if (document.body) {
            document.body.setAttribute("data-route", routeName || "unknown");
        }

        const needed = routeHrefs.get(routeName);

        // Activate sheets for the current route (lazy-create on first visit).
        if (needed) {
            for (const href of needed) {
                ensureLink(href).media = "all";
            }
        }

        // Deactivate sheets that belong to other routes.
        for (const [href, el] of linkByHref) {
            if (!needed || !needed.has(href)) {
                el.media = "not all";
            }
        }
    }

    return { apply };
}
