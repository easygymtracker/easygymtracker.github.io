// app/styleRouter.js

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

export function createStyleRouter({ routeToStyles = {}, resolveFrom = import.meta.url } = {}) {
    const activeLinks = new Map();

    function resolveStyleHref(stylePath) {
        return new URL(stylePath, resolveFrom).href;
    }

    function stylesForRoute(routeName) {
        return toArray(routeToStyles[routeName]);
    }

    function apply(routeName) {
        if (document?.body) {
            document.body.setAttribute("data-route", routeName || "unknown");
        }

        const nextHrefs = new Set(stylesForRoute(routeName).map(resolveStyleHref));

        for (const [href, linkEl] of activeLinks.entries()) {
            if (!nextHrefs.has(href)) {
                linkEl.remove();
                activeLinks.delete(href);
            }
        }

        for (const href of nextHrefs) {
            if (activeLinks.has(href)) continue;

            const linkEl = document.createElement("link");
            linkEl.rel = "stylesheet";
            linkEl.href = href;
            linkEl.setAttribute("data-style-router", "true");
            document.head.appendChild(linkEl);
            activeLinks.set(href, linkEl);
        }
    }

    return { apply };
}
