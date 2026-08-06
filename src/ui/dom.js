// ui/dom.js

export function qs(sel, root = document) {
    return root.querySelector(sel);
}

export function escapeHtml(s) {
    return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/** For values going into an attribute, where a raw newline would break it. */
export function escapeHtmlAttr(s) {
    return escapeHtml(s).replaceAll("\n", " ");
}

// Visibility is a class rather than the hidden attribute because .btn and other
// components set `display`, which wins over the user-agent [hidden] rule.

export function show(el) {
    el?.classList.remove("uHidden");
}

export function hide(el) {
    el?.classList.add("uHidden");
}

/** Single call site for conditional visibility: setHidden(el, !isReady). */
export function setHidden(el, hidden) {
    el?.classList.toggle("uHidden", Boolean(hidden));
}
