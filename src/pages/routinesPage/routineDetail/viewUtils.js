// pages/routineDetail/viewUtils.js

// Re-exported so importers here keep one import line, but there is now a single
// implementation (ui/dom.js) rather than two copies free to drift apart.
export { escapeHtml, escapeHtmlAttr } from "../../../ui/dom.js";

export function flashInvalid(inputEl) {
    inputEl.focus();
    const prev = inputEl.style.borderColor;
    inputEl.style.borderColor = "rgba(248,113,113,0.7)";
    setTimeout(() => (inputEl.style.borderColor = prev), 700);
}

export function flashOk(el) {
    const prev = el.style.borderColor;
    el.style.borderColor = "rgba(96,165,250,0.75)";
    setTimeout(() => (el.style.borderColor = prev), 350);
}