// src/utils/numberFormat.js

export function pad2(n) {
    return String(n).padStart(2, "0");
}

export function formatMs(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${pad2(m)}:${pad2(s)}`;
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