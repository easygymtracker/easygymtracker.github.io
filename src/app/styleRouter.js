// app/styleRouter.js

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

export function createStyleRouter({ routeToStyles = {}, resolveFrom = import.meta.url } = {}) {
    const managedLinks = new Map();
    const managedPreloads = new Set();

    function resolveStyleHref(stylePath) {
        return new URL(stylePath, resolveFrom).href;
    }

    function stylesForRoute(routeName) {
        return toArray(routeToStyles[routeName]);
    }

    function allStyleHrefs() {
        return Array.from(
            new Set(
                Object.values(routeToStyles)
                    .flatMap((value) => toArray(value))
                    .map(resolveStyleHref)
            )
        );
    }

    function findManagedLink(href) {
        for (const linkEl of document.head.querySelectorAll('link[data-style-router="true"][rel="stylesheet"]')) {
            if (linkEl.href === href) return linkEl;
        }
        return null;
    }

    function ensureManagedLink(href) {
        if (managedLinks.has(href)) return managedLinks.get(href);

        const existing = findManagedLink(href);
        if (existing) {
            managedLinks.set(href, existing);
            return existing;
        }

        const linkEl = document.createElement("link");
        linkEl.rel = "stylesheet";
        linkEl.href = href;
        linkEl.media = "not all";
        linkEl.setAttribute("data-style-router", "true");
        document.head.appendChild(linkEl);
        managedLinks.set(href, linkEl);
        return linkEl;
    }

    function ensurePreload(href) {
        if (managedPreloads.has(href)) return;
        for (const preloadEl of document.head.querySelectorAll('link[data-style-router-preload="true"][rel="preload"][as="style"]')) {
            if (preloadEl.href === href) {
                managedPreloads.add(href);
                return;
            }
        }

        const preloadEl = document.createElement("link");
        preloadEl.rel = "preload";
        preloadEl.as = "style";
        preloadEl.href = href;
        preloadEl.setAttribute("data-style-router-preload", "true");
        document.head.appendChild(preloadEl);
        managedPreloads.add(href);
    }

    function prewarmRouteStyles() {
        for (const href of allStyleHrefs()) {
            ensurePreload(href);
            ensureManagedLink(href);
        }
    }

    prewarmRouteStyles();

    function apply(routeName) {
        if (document?.body) {
            document.body.setAttribute("data-route", routeName || "unknown");
        }

        const nextHrefs = new Set(stylesForRoute(routeName).map(resolveStyleHref));

        for (const href of allStyleHrefs()) {
            const linkEl = ensureManagedLink(href);
            linkEl.media = nextHrefs.has(href) ? "all" : "not all";
        }
    }

    return { apply };
}
