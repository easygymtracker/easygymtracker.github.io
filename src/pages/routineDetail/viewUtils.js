export function escapeHtml(s) {
    return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export function escapeHtmlAttr(s) {
    return escapeHtml(s).replaceAll("\n", " ");
}

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

export function toNonNegativeNumber(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return n;
}

export function toPositiveInt(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n);
}

export function toNullableNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return n;
}