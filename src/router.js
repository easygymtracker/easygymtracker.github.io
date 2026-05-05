// router.js - tiny history router + simple event emitter

const ROUTE_HEADS = new Set(["features", "privacy", "about", "routines", "routine", "session", "profile", "profile-history", "exercise"]);

function normalizePath(path) {
    if (!path) return "/routines";
    let p = String(path).trim();
    if (!p.startsWith("/")) p = `/${p}`;
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    if (p === "/index.html") p = "/";
    return p;
}

function detectBasePath(pathname = location.pathname) {
    const parts = normalizePath(pathname).split("/").filter(Boolean);
    if (!parts.length) return "";

    const first = parts[0];
    if (ROUTE_HEADS.has(first)) return "";

    // GitHub Pages project sites usually mount app under /<repo-name>/
    if (location.hostname.endsWith("github.io")) return `/${first}`;

    return "";
}

function stripBasePath(pathname, basePath) {
    const normalized = normalizePath(pathname);
    if (!basePath) return normalized;

    if (normalized === basePath) return "/";
    if (normalized.startsWith(`${basePath}/`)) {
        return normalized.slice(basePath.length) || "/";
    }

    return normalized;
}

const BASE_PATH = detectBasePath();

function toBrowserUrl(appPath) {
    const path = normalizePath(appPath);
    if (!BASE_PATH) return path;
    if (path === "/") return `${BASE_PATH}/`;
    return `${BASE_PATH}${path}`;
}

function currentAppPath() {
    return stripBasePath(location.pathname, BASE_PATH);
}

function currentAppPathWithSearch() {
    return `${currentAppPath()}${location.search || ""}`;
}

function parseCurrentRoute() {
    const path = currentAppPath();
    const parts = path.split("/").filter(Boolean);
    const query = new URLSearchParams(location.search || "");

    if (parts.length === 0) return { name: "home", params: {} };

    if (parts[0] === "features") return { name: "features", params: {} };

    if (parts[0] === "privacy") return { name: "privacy", params: {} };

    if (parts[0] === "about") return { name: "about", params: {} };

    if (parts[0] === "routines") return { name: "routines", params: {} };

    if (parts[0] === "profile" && parts[1] === "history") {
        return { name: "profile-history", params: {} };
    }

    if (parts[0] === "profile") return { name: "profile", params: {} };

    if (parts[0] === "exercise" && parts[1] && parts[2] === "history") {
        return { name: "exercise-history", params: { exerciseId: parts[1] } };
    }

    if (parts[0] === "routine" && parts[1] === "new") {
        return { name: "routine-new", params: {} };
    }

    if (parts[0] === "routine" && parts[1]) {
        return { name: "routine", params: { id: parts[1] } };
    }

    if (parts[0] === "session" && parts[1]) {
        return { name: "session", params: { routineId: parts[1] } };
    }

    if (parts[0] === "session") {
        const routineId = query.get("routineId");
        if (routineId) return { name: "session", params: { routineId } };
    }

    return { name: "home", params: {} };
}

function normalizeLegacyHashUrl() {
    // Backward-compat for old links like /#/routine/abc?lang=es
    const rawHash = String(location.hash || "");
    if (!rawHash.startsWith("#/")) return;

    const raw = rawHash.slice(1); // "/routine/abc?lang=es"
    const [pathPart, queryPart] = raw.split("?");
    const appPath = normalizePath(pathPart || "/routines");
    const nextPath = toBrowserUrl(appPath);

    const mergedQuery = new URLSearchParams(location.search || "");
    if (queryPart) {
        const hashQuery = new URLSearchParams(queryPart);
        for (const [k, v] of hashQuery.entries()) mergedQuery.set(k, v);
    }

    const query = mergedQuery.toString();
    const nextUrl = `${nextPath}${query ? `?${query}` : ""}`;
    history.replaceState(null, "", nextUrl);
}

let leaveGuard = null;

export function setLeaveGuard(fn) {
    leaveGuard = typeof fn === "function" ? fn : null;
}

export function clearLeaveGuard() {
    leaveGuard = null;
}

function canLeave({ fromPath, toPath, reason }) {
    if (!leaveGuard) return true;
    try {
        return leaveGuard({ fromPath, toPath, reason }) !== false;
    } catch {
        // Fail open to avoid trapping the user due to guard errors
        return true;
    }
}

export function navigate(path) {
    const targetPath = normalizePath(path);
    const fromPath = currentAppPathWithSearch();
    const toPath = targetPath;

    if (toPath === fromPath) return;
    if (!canLeave({ fromPath, toPath, reason: "navigate" })) return;

    history.pushState(null, "", toBrowserUrl(targetPath));
    onNavigate.emit();
}

// Small event emitter so other parts can request a re-render
export const onNavigate = (() => {
    const listeners = new Set();
    return {
        subscribe(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
        emit() {
            listeners.forEach((fn) => fn());
        },
    };
})();

export function startRouter({ defaultPath = "/routines", onRoute }) {
    normalizeLegacyHashUrl();

    // global nav: intercept [data-nav] elements AND same-origin <a href> links
    document.addEventListener("click", (e) => {
        // data-nav wins (supports buttons and explicit nav links)
        const nav = e.target.closest("[data-nav]");
        if (nav) {
            e.preventDefault();
            const target = nav.getAttribute("data-nav");
            if (target) navigate(target);
            return;
        }

        // plain <a href> — intercept same-origin links for SPA navigation
        const anchor = e.target.closest("a[href]");
        if (!anchor) return;
        const href = anchor.getAttribute("href");
        if (!href) return;
        // skip external, mailto, tel, hash-only, and target="_blank" links
        if (
            href.startsWith("http://") ||
            href.startsWith("https://") ||
            href.startsWith("mailto:") ||
            href.startsWith("tel:") ||
            href.startsWith("#") ||
            anchor.target === "_blank" ||
            anchor.hasAttribute("download")
        ) return;
        e.preventDefault();
        navigate(href);
    });

    function render() {
        const route = parseCurrentRoute();
        onRoute(route);
    }

    if (currentAppPath() === "/") {
        history.replaceState(null, "", toBrowserUrl(defaultPath));
    }

    let lastPath = currentAppPathWithSearch();

    window.addEventListener("popstate", () => {
        const fromPath = lastPath;
        const toPath = currentAppPathWithSearch();

        if (toPath !== fromPath && !canLeave({ fromPath, toPath, reason: "popstate" })) {
            history.pushState(null, "", toBrowserUrl(fromPath));
            return;
        }

        lastPath = toPath;
        onNavigate.emit();
    });

    onNavigate.subscribe(() => {
        lastPath = currentAppPathWithSearch();
        render();
    });

    render();
}
