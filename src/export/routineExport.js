// src/export/routineExport.js

import { assert } from "../utils/validate.js";

/**
 * Portable fixed export format:
 * - No internal IDs (exerciseId/rt/ss/rg ids are device-local)
 * - Uses exercise.description to relink on import
 */
export function buildRoutineExportV1({ routine, exerciseStore }) {
    assert(routine && typeof routine === "object", "routine is required");
    assert(exerciseStore, "exerciseStore is required");

    const series = (routine.series ?? []).map((ss) => {
        const ex = exerciseStore.getById(ss.exerciseId);
        const exDesc = String(ex?.description ?? "").trim();

        // If somehow missing, keep a placeholder; importing can decide what to do.
        const exerciseDescription = exDesc || "(unknown exercise)";

        return {
            description: String(ss.description ?? ""),
            restSecondsAfter: Number(ss.restSecondsAfter ?? 0),

            exercise: { description: exerciseDescription },

            repGroups: (ss.repGroups ?? []).map((rg) => ({
                laterality: rg.laterality,
                targetReps: rg.targetReps ?? null,
                targetWeight: rg.targetWeight ?? null,
                restSecondsAfter: Number(rg.restSecondsAfter ?? 0),
                history: Array.isArray(rg.history) ? rg.history.map((e) => ({ ...e })) : [],
            })),
        };
    });

    return {
        format: "GymAppRoutineExport",
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        app: {
            name: "Easy Gym Routine Tracker",
            storageNamespace: "routinetracker_v1",
        },
        routine: {
            name: String(routine.name ?? "").trim(),
            description: String(routine.description ?? ""),
            series,
        },
    };
}

/**
 * Download helper (browser)
 */
export function downloadJson({ filename, data }) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // release object URL
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function safeFilenameBase(s) {
    const base = String(s ?? "")
        .trim()
        .toLowerCase()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return base || "routine";
}

export function routineExportFilename(routine) {
    const base = safeFilenameBase(routine?.name);
    // fixed, stable naming (formatVersion is in JSON)
    return `${base}.gymroutine.json`;
}