// ui/format.js
//
// One place for turning stored values into display strings.
//
// These formatters were previously copy-pasted across five files, which is how
// the same timestamp ended up rendered three different ways. Intl formatters are
// built once and reused: constructing one is the expensive part, and these run
// inside list-rendering loops.

import { t } from "../internationalization/i18n.js";

/** Placeholder for "no value". Mirrors the common.dash dictionary entry. */
export const DASH = "—";

const DATE_TIME = new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
});

const DATE_SHORT = new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric",
});

const DATE_WITH_WEEKDAY = new Intl.DateTimeFormat(undefined, {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
});

const TIME_ONLY = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const MONTH_YEAR = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const WEEKDAY_SHORT = new Intl.DateTimeFormat(undefined, { weekday: "short" });

/**
 * Runs `formatter` over anything Date-like.
 * An empty or unparseable value yields `fallback` rather than leaking a raw ISO
 * string into the UI — callers that need the raw value pass it as the fallback.
 */
function format(value, formatter, fallback) {
    if (!value) return fallback;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return formatter.format(date);
}

/** "Aug 4, 2026, 10:30" */
export function formatDateTime(value, fallback = DASH) {
    return format(value, DATE_TIME, fallback);
}

/** "Aug 4, 2026" */
export function formatDate(value, fallback = DASH) {
    return format(value, DATE_SHORT, fallback);
}

/** "Tue, Aug 4, 2026" */
export function formatDateWithWeekday(value, fallback = DASH) {
    return format(value, DATE_WITH_WEEKDAY, fallback);
}

/** "10:30" */
export function formatTime(value, fallback = DASH) {
    return format(value, TIME_ONLY, fallback);
}

/** "August 2026" */
export function formatMonthYear(value, fallback = DASH) {
    return format(value, MONTH_YEAR, fallback);
}

/** Localised weekday names starting on Sunday, for calendar headers. */
export function weekdayLabels() {
    const base = new Date(Date.UTC(2026, 0, 4)); // A known Sunday.
    return Array.from({ length: 7 }, (_, i) => {
        const day = new Date(base);
        day.setUTCDate(base.getUTCDate() + i);
        return WEEKDAY_SHORT.format(day);
    });
}

/** "2026-08-04" — the key format used to group entries by day. */
export function toDayKey(value) {
    return String(value || "").slice(0, 10);
}

/** Value with an optional unit, or the dash placeholder when absent. */
export function formatValue(value, suffix = "") {
    if (value == null) return t("common.dash");
    return `${value}${suffix}`;
}

/** Local-time value for an <input type="datetime-local">. */
export function toInputDateTime(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "";

    // Shift by the offset so toISOString() yields local wall-clock time, which
    // is what the input expects — it has no timezone of its own.
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

/** Parses a number field, treating blank as "not provided" rather than 0. */
export function parseOptionalNumber(value) {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}
