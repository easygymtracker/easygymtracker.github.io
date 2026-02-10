// router.js - tiny hash router + simple event emitter

function parseHash() {
    const raw = location.hash || "#/routines";
    const path = raw.replace(/^#/, "");
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

let leaveGuard = null;

export function setLeaveGuard(fn) {
    leaveGuard = typeof fn === "function" ? fn : null;
}

export function clearLeaveGuard() {
    leaveGuard = null;
}

function canLeave({ fromHash, toHash, reason }) {
    if (!leaveGuard) return true;
    try {
        return leaveGuard({ fromHash, toHash, reason }) !== false;
    } catch {
        // Fail open to avoid trapping the user due to guard errors
        return true;
    }
}

export function navigate(hash) {
    const fromHash = location.hash || "#/routines";
    const toHash = hash;

    if (toHash === fromHash) return;

    if (!canLeave({ fromHash, toHash, reason: "navigate" })) return;

    location.hash = hash;
}

// Small event emitter so other parts can request a re-render
export const onNavigate = (() => {
    const listeners = new Set();
    return {
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        emit() { listeners.forEach((fn) => fn()); },
    };
})();

export function startRouter({ defaultHash = "#/routines", onRoute }) {
    // global nav buttons
    document.addEventListener("click", (e) => {
        const nav = e.target.closest("[data-nav]");
        if (!nav) return;
        navigate(nav.getAttribute("data-nav"));
    });

    function render() {
        const route = parseHash();
        onRoute(route);
    }

    if (!location.hash) location.hash = defaultHash;
    let lastHash = location.hash;

    window.addEventListener("hashchange", () => {
        const fromHash = lastHash;
        const toHash = location.hash;

        if (toHash !== fromHash && !canLeave({ fromHash, toHash, reason: "hashchange" })) {
            history.replaceState(null, "", fromHash);
            return;
        }

        lastHash = toHash;
        onNavigate.emit();
    });

    onNavigate.subscribe(render);

    render();
}