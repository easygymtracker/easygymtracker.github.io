// src/import/profileImport.js

function toFiniteOrNull(v) {
    if (v == null) return null;
    const n = typeof v === "string" ? Number(v.trim()) : Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * Import profile measurements from a parsed export object.
 * Skips entries whose `recordedAt` already exists in the store (deduplication).
 * Returns { imported, skipped }.
 */
export function importProfileFromExport({ parsed, profileStore }) {
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid file contents");
    if (parsed.format !== "GymAppProfileExport") throw new Error("Unsupported file format");
    if (parsed.formatVersion !== 1) throw new Error("Unsupported format version");

    const raw = parsed.measurements;
    if (!Array.isArray(raw)) throw new Error("Missing measurements array");

    const existing = new Set(profileStore.listEntries().map((e) => e.recordedAt));

    let imported = 0;
    let skipped = 0;

    for (const item of raw) {
        const recordedAt = item.recordedAt ? String(item.recordedAt) : null;
        if (!recordedAt) { skipped++; continue; }
        if (existing.has(recordedAt)) { skipped++; continue; }

        const weightKg = toFiniteOrNull(item.weightKg);
        const bodyFatPct = toFiniteOrNull(item.bodyFatPct);
        const muscleKg = toFiniteOrNull(item.muscleKg);

        if (weightKg == null && bodyFatPct == null && muscleKg == null) { skipped++; continue; }

        profileStore.addEntry({ recordedAt, weightKg, bodyFatPct, muscleKg });
        existing.add(recordedAt);
        imported++;
    }

    return { imported, skipped };
}
