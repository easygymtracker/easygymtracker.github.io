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

export function importRoutineFromExport({ rawText, routineStore, exerciseStore }) {
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

    const routine = new Routine({
        id: newId("rt"),
        name: String(src.name ?? "").trim(),
        description: String(src.description ?? ""),
        series: [],
    });

    for (const s of src.series ?? []) {
        const exDesc = String(s.exercise?.description ?? "").trim();
        assert(exDesc, "Series is missing exercise description");

        const exercise = exerciseStore.getOrCreateByDescription(exDesc);

        const ss = new SetSeries({
            id: newId("ss"),
            exerciseId: exercise.id,
            description: String(s.description ?? ""),
            restSecondsAfter: Number(s.restSecondsAfter ?? 0),
            repGroups: [],
        });

        for (const g of s.repGroups ?? []) {
            const rg = new RepGroup({
                id: newId("rg"),
                exerciseId: exercise.id,
                laterality: g.laterality,
                targetReps: g.targetReps ?? null,
                targetWeight: g.targetWeight ?? null,
                restSecondsAfter: Number(g.restSecondsAfter ?? 0),
                history: Array.isArray(g.history) ? g.history.map((e) => ({ ...e })) : [],
            });

            ss.repGroups.push(rg);
        }

        routine.series.push(ss);
    }

    routineStore.update(routine);
    return routine;
}