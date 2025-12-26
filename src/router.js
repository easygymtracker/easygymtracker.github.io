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

  return { name: "routines", params: {} };
}

export function navigate(hash) {
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

  window.addEventListener("hashchange", () => {
    render();
    onNavigate.emit();
  });

  onNavigate.subscribe(render);

  if (!location.hash) location.hash = defaultHash;
  render();
}