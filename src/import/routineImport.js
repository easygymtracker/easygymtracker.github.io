// src/import/routineImport.js

import { Routine } from "../models/routine.js";
import { SetSeries } from "../models/setSeries.js";
import { RepGroup } from "../models/repGroup.js";

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

function newId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toFiniteNumberOr(fallback, v) {
    const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
    return Number.isFinite(n) ? n : fallback;
}

function normalizeTuple(v, { coerce = (x) => x } = {}) {
    if (v == null) return null;

    if (typeof v === "object") {
        const left = v.left ?? null;
        const right = v.right ?? null;
        return {
            left: left == null ? null : coerce(left),
            right: right == null ? null : coerce(right),
        };
    }

    return coerce(v);
}

function coerceInt(v) {
    const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
    return Number.isFinite(n) ? Math.trunc(n) : n;
}

function coerceNumber(v) {
    const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
    return Number.isFinite(n) ? n : n;
}

/**
 * Merge two history arrays by dateTime key.
 * Import entries win on conflict (same dateTime).
 */
function mergeHistory(existingHistory, importHistory) {
    const map = new Map();
    for (const e of existingHistory) map.set(e.dateTime, e);
    for (const e of importHistory) map.set(e.dateTime, e); // import wins
    return [...map.values()].sort((a, b) => Date.parse(a.dateTime) - Date.parse(b.dateTime));
}

/**
 * Parse and validate the raw JSON text. Returns { parsed, existingRoutine | null }.
 */
export function parseRoutineExport({ rawText, routineStore }) {
    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        throw new Error("Invalid JSON file");
    }

    assert(parsed.format === "GymAppRoutineExport", "Unsupported file format");
    assert(parsed.formatVersion === 1, "Unsupported format version");

    const src = parsed.routine;
    assert(src && typeof src === "object", "Missing routine data");

    const existingRoutine = src.id ? routineStore.getById(src.id) : null;

    return { parsed, existingRoutine };
}

export function importRoutineFromExport({ rawText, routineStore, exerciseStore }) {
    const { parsed, existingRoutine } = parseRoutineExport({ rawText, routineStore });
    const src = parsed.routine;

    // Build a map of existing repGroup histories keyed by repGroup ID
    const existingRgHistories = new Map();
    if (existingRoutine) {
        for (const ss of existingRoutine.series ?? []) {
            for (const rg of ss.repGroups ?? []) {
                if (rg.id && rg.history?.length) {
                    existingRgHistories.set(rg.id, rg.history);
                }
            }
        }
    }

    const routineId = existingRoutine ? existingRoutine.id : (src.id || newId("rt"));

    const routine = new Routine({
        id: routineId,
        name: String(src.name ?? "").trim(),
        description: String(src.description ?? ""),
        series: [],
    });

    for (const s of src.series ?? []) {
        const exDesc = String(s.exercise?.description ?? "").trim();
        assert(exDesc, "Series is missing exercise description");

        const exercise = exerciseStore.getOrCreateByDescription(exDesc);

        const ssId = s.id || newId("ss");

        const ss = new SetSeries({
            id: ssId,
            exerciseId: exercise.id,
            description: String(s.description ?? ""),
            restSecondsAfter: toFiniteNumberOr(0, s.restSecondsAfter ?? 0),
            repGroups: [],
        });

        for (const g of s.repGroups ?? []) {
            const importHistory = Array.isArray(g.history)
                ? g.history.map((e) => ({
                    ...e,
                    reps: normalizeTuple(e.reps, { coerce: coerceInt }),
                    weight: normalizeTuple(e.weight, { coerce: coerceNumber }),
                }))
                : [];

            const rgId = g.id || newId("rg");

            // Merge history if this repGroup existed before
            const prevHistory = existingRgHistories.get(rgId) ?? [];
            const finalHistory = prevHistory.length
                ? mergeHistory(prevHistory, importHistory)
                : importHistory;

            const rg = new RepGroup({
                id: rgId,
                exerciseId: exercise.id,
                laterality: g.laterality,
                targetReps: normalizeTuple(g.targetReps ?? null, { coerce: coerceInt }),
                targetWeight: normalizeTuple(g.targetWeight ?? null, { coerce: coerceNumber }),
                restSecondsAfter: toFiniteNumberOr(0, g.restSecondsAfter ?? 0),
                history: finalHistory,
            });

            ss.repGroups.push(rg);
        }

        routine.series.push(ss);
    }

    routineStore.update(routine);
    return { routine, updated: !!existingRoutine };
}