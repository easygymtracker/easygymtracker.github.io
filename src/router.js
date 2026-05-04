// router.js - tiny history router + simple event emitter

function normalizePath(path) {
    if (!path) return "/routines";
    let p = String(path).trim();
    if (!p.startsWith("/")) p = `/${p}`;
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    if (p === "/index.html") p = "/";
    return p;
}

function currentPathWithSearch() {
    const path = normalizePath(location.pathname);
    return `${path}${location.search || ""}`;
}

function parseCurrentRoute() {
    const path = normalizePath(location.pathname);
    const parts = path.split("/").filter(Boolean);

    if (parts.length === 0) return { name: "routines", params: {} };

    if (parts[0] === "routines") return { name: "routines", params: {} };

    if (parts[0] === "routine" && parts[1] === "new") {
        return { name: "routine-new", params: {} };
    }

    if (parts[0] === "routine" && parts[1]) {
        return { name: "routine", params: { id: parts[1] } };
    }

    if (parts[0] === "session" && parts[1]) {
        return { name: "session", params: { routineId: parts[1] } };
    }

    return { name: "routines", params: {} };
}

function normalizeLegacyHashUrl() {
    // Backward-compat for old links like /#/routine/abc?lang=es
    const rawHash = String(location.hash || "");
    if (!rawHash.startsWith("#/")) return;

    const raw = rawHash.slice(1); // "/routine/abc?lang=es"
    const [pathPart, queryPart] = raw.split("?");
    const nextPath = normalizePath(pathPart || "/routines");

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
    const fromPath = currentPathWithSearch();
    const toPath = targetPath;

    if (toPath === fromPath) return;

    if (!canLeave({ fromPath, toPath, reason: "navigate" })) return;

    history.pushState(null, "", toPath);
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

    // global nav buttons/links
    document.addEventListener("click", (e) => {
        const nav = e.target.closest("[data-nav]");
        if (!nav) return;

        e.preventDefault();
        const target = nav.getAttribute("data-nav");
        if (!target) return;
        navigate(target);
    });

    function render() {
        const route = parseCurrentRoute();
        onRoute(route);
    }

    if (normalizePath(location.pathname) === "/") {
        history.replaceState(null, "", normalizePath(defaultPath));
    }

    let lastPath = currentPathWithSearch();

    window.addEventListener("popstate", () => {
        const fromPath = lastPath;
        const toPath = currentPathWithSearch();

        if (toPath !== fromPath && !canLeave({ fromPath, toPath, reason: "popstate" })) {
            history.pushState(null, "", fromPath);
            return;
        }

        lastPath = toPath;
        onNavigate.emit();
    });

    onNavigate.subscribe(() => {
        lastPath = currentPathWithSearch();
        render();
    });

    render();
}
