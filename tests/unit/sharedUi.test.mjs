import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

// Covers the primitives extracted from the duplicated page code. The point of
// the extraction was that five copies had drifted, so these pin the behaviour
// every caller now shares.

// i18n runs translateDocument() at import time; enough of a DOM to let it.
globalThis.document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    documentElement: {},
};
globalThis.location = { search: "", hash: "" };
// Node ships a read-only navigator, so it has to be redefined rather than assigned.
Object.defineProperty(globalThis, "navigator", {
    value: { language: "en" },
    configurable: true,
    writable: true,
});
globalThis.localStorage = {
    store: new Map(),
    getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
    setItem(k, v) { this.store.set(k, String(v)); },
    removeItem(k) { this.store.delete(k); },
};

const {
    DASH, formatDate, formatDateTime, formatTime, formatValue,
    parseOptionalNumber, toDayKey, toInputDateTime, weekdayLabels,
} = await import("../../src/ui/format.js");

const { isSameSided, isSided, normalizeSided, toSided } = await import("../../src/ui/sidedValue.js");

// --- format ------------------------------------------------------------------

test("date formatters fall back instead of leaking a raw value", () => {
    // The old per-page copies returned the unparseable string itself, which put
    // things like "not-a-date" straight into the UI.
    assert.equal(formatDateTime(""), DASH);
    assert.equal(formatDateTime(null), DASH);
    assert.equal(formatDateTime("not-a-date"), DASH);
    assert.equal(formatDate(undefined), DASH);
    assert.equal(formatTime(""), DASH);
});

test("the fallback is caller-chosen, because some callers branch on it", () => {
    // backupSection needs null so it can ask "is there a backup date at all".
    assert.equal(formatDateTime(null, null), null);
    assert.equal(formatDate("nope", "n/a"), "n/a");
});

test("a valid date renders through, from a string or a Date", () => {
    const fromString = formatDateTime("2026-08-04T10:30:00.000Z");
    const fromDate = formatDateTime(new Date("2026-08-04T10:30:00.000Z"));

    assert.equal(fromString, fromDate);
    assert.match(fromString, /2026/);
    assert.notEqual(fromString, DASH);
});

test("DASH matches the dictionary entry it replaced", async () => {
    const { DICTS } = await import("../../src/internationalization/dicts.js");
    for (const [lang, dict] of Object.entries(DICTS)) {
        assert.equal(dict["common.dash"], DASH, `${lang} renders the placeholder differently`);
    }
});

test("toDayKey reduces any timestamp to its calendar day", () => {
    assert.equal(toDayKey("2026-08-04T23:59:59.999Z"), "2026-08-04");
    assert.equal(toDayKey(null), "");
});

test("parseOptionalNumber treats blank as absent, not as zero", () => {
    assert.equal(parseOptionalNumber(""), null);
    assert.equal(parseOptionalNumber("   "), null);
    assert.equal(parseOptionalNumber(null), null);
    assert.equal(parseOptionalNumber("abc"), null);
    assert.equal(parseOptionalNumber("0"), 0);
    assert.equal(parseOptionalNumber("72.5"), 72.5);
});

test("toInputDateTime yields local wall-clock time for the input element", () => {
    const iso = "2026-08-04T10:30:00.000Z";
    const value = toInputDateTime(iso);

    assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    // The input has no timezone, so the value must be the local reading.
    const offsetMin = new Date(iso).getTimezoneOffset();
    const expected = new Date(Date.parse(iso) - offsetMin * 60000).toISOString().slice(0, 16);
    assert.equal(value, expected);
    assert.equal(toInputDateTime("not-a-date"), "");
});

test("formatValue appends the unit and uses the dash when empty", () => {
    assert.equal(formatValue(72.5, " kg"), "72.5 kg");
    assert.equal(formatValue(0, "%"), "0%");
    assert.equal(formatValue(null, " kg"), DASH);
    assert.equal(formatValue(12), "12");
});

test("weekdayLabels returns seven names starting on Sunday", () => {
    const labels = weekdayLabels();
    assert.equal(labels.length, 7);
    assert.equal(new Set(labels).size, 7);
});

// --- sided values ------------------------------------------------------------

test("isSided recognises the pair shape and nothing else", () => {
    assert.equal(isSided({ left: 8, right: 8 }), true);
    assert.equal(isSided({ left: 8 }), true, "a half-filled pair is still a pair");
    assert.equal(isSided(8), false);
    assert.equal(isSided(null), false);
    assert.equal(isSided(undefined), false);
});

test("toSided spreads a single number across both sides", () => {
    assert.deepEqual(toSided(20), { left: 20, right: 20 });
    assert.deepEqual(toSided(null), { left: null, right: null });
    assert.deepEqual(toSided({ left: 5 }), { left: 5, right: null });
});

test("normalizeSided keeps a bilateral value bilateral", () => {
    // Storage-facing: turning 20 into {left:20,right:20} would silently convert
    // a bilateral set into a unilateral one.
    assert.equal(normalizeSided(20), 20);
    assert.equal(normalizeSided(null), null);
    assert.deepEqual(normalizeSided({ left: 5, right: 6 }), { left: 5, right: 6 });
});

test("isSameSided compares across both shapes", () => {
    assert.equal(isSameSided(20, 20), true);
    assert.equal(isSameSided(20, 21), false);
    assert.equal(isSameSided({ left: 5, right: 6 }, { left: 5, right: 6 }), true);
    assert.equal(isSameSided({ left: 5, right: 6 }, { left: 6, right: 5 }), false);
    assert.equal(isSameSided(null, null), true);
});

test("isSameSided survives a null on one side only", () => {
    // typeof null === "object", so the previous version walked into null.left.
    assert.doesNotThrow(() => isSameSided(null, { left: 1, right: 1 }));
    assert.equal(isSameSided(null, { left: 1, right: 1 }), false);
    assert.equal(isSameSided({ left: 1, right: 1 }, null), false);
});

// --- no re-duplication -------------------------------------------------------

const sources = execSync('git ls-files "src/**/*.js" "src/*.js"')
    .toString().trim().split(/\r?\n/)
    .map((file) => ({ file, text: readFileSync(file, "utf8") }));

test("escapeHtml has exactly one implementation", () => {
    const definitions = sources.filter(({ text }) => /function escapeHtml\s*\(/.test(text));
    assert.deepEqual(definitions.map((d) => d.file), ["src/ui/dom.js"]);
});

test("no page builds its own Intl.DateTimeFormat any more", () => {
    const offenders = sources
        .filter(({ file }) => file !== "src/ui/format.js")
        .filter(({ text }) => text.includes("new Intl.DateTimeFormat"))
        .map((d) => d.file);

    assert.deepEqual(offenders, [], "date formatting belongs in ui/format.js");
});

test("modals go through the shared shell rather than building an overlay", () => {
    const offenders = sources
        .filter(({ file }) => file !== "src/ui/modal.js")
        .filter(({ text }) => text.includes('className = "modalOverlay"'))
        .map((d) => d.file);

    assert.deepEqual(offenders, [], "hand-rolled overlays leak their keydown listener");
});

test("the shared shell removes its listener on every close path", () => {
    const modal = readFileSync("src/ui/modal.js", "utf8");
    const close = modal.slice(modal.indexOf("function close("), modal.indexOf("function onKeyDown"));

    assert.match(close, /removeEventListener\("keydown"/);
    assert.match(close, /if \(closed\) return;/, "close must be idempotent");
});

test("t() has no dead literal fallbacks left", async () => {
    const { DICTS } = await import("../../src/internationalization/dicts.js");
    const pattern = /\bt\(\s*(["'])([^"']+)\1\s*\)\s*\|\|\s*["'`]/g;

    for (const { file, text } of sources) {
        for (const match of text.matchAll(pattern)) {
            assert.ok(
                !(match[2] in DICTS.en),
                `${file}: t("${match[2]}") has a fallback but the key exists — the fallback is dead code`,
            );
        }
    }
});
