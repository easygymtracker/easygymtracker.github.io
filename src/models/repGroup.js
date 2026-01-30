// models/repGroup.js

import { newId } from "../utils/id.js";
import { assert, isFiniteNumber } from "../utils/validate.js";

export const Laterality = Object.freeze({
    UNILATERAL: "unilateral",
    BILATERAL: "bilateral",
});

// --- helpers ---
function isIsoDateTime(s) {
    // Accepts ISO 8601 strings that Date can parse (e.g. "2025-12-26T18:45:00.000Z"
    // or with offset "2025-12-26T19:45:00+01:00").
    if (typeof s !== "string" || s.length < 10) return false;
    const t = Date.parse(s);
    return Number.isFinite(t);
}

function isPlainObject(x) {
    return x !== null && typeof x === "object" && Object.getPrototypeOf(x) === Object.prototype;
}

function isLRTuple(x) {
    return (
        isPlainObject(x) &&
        Object.prototype.hasOwnProperty.call(x, "left") &&
        Object.prototype.hasOwnProperty.call(x, "right")
    );
}

function cloneLR(x) {
    if (x === null) return null;
    if (isFiniteNumber(x)) return x;
    return { left: x.left ?? null, right: x.right ?? null };
}

function cloneEntry(e) {
    return {
        dateTime: e.dateTime,
        reps: cloneLR(e.reps),
        weight: cloneLR(e.weight),
    };
}

function validateWeight(w) {
    if (w === null) return;
    if (isFiniteNumber(w)) return;

    if (isLRTuple(w)) {
        assert(w.left === null || isFiniteNumber(w.left), "weight.left must be number|null");
        assert(w.right === null || isFiniteNumber(w.right), "weight.right must be number|null");
        return;
    }

    throw new Error("weight must be null, number, or {left,right}");
}

function validateReps(r) {
    if (r === null) return;

    if (isFiniteNumber(r)) {
        assert(Number.isInteger(r) && r > 0, "reps must be a positive integer");
        return;
    }

    if (isLRTuple(r)) {
        assert(
            r.left === null || (isFiniteNumber(r.left) && Number.isInteger(r.left) && r.left > 0),
            "reps.left must be positive int|null"
        );
        assert(
            r.right === null || (isFiniteNumber(r.right) && Number.isInteger(r.right) && r.right > 0),
            "reps.right must be positive int|null"
        );
        return;
    }

    throw new Error("reps must be null, positive integer, or {left,right}");
}

/**
 * History entry:
 * - dateTime (ISO 8601 string) is the key (unique per entry)
 * - reps + weight are performed values
 */
export class RepGroup {
    constructor({
        id = newId("rg"),
        exerciseId,
        laterality = Laterality.BILATERAL,

        // optional targets (prefill / planned progression)
        targetReps = null,
        targetWeight = null,

        // rest after finishing this RepGroup
        restSecondsAfter = 0,

        // Array<{ dateTime, reps, weight }>
        history = [],
    } = {}) {
        this.id = id;
        this.exerciseId = exerciseId;
        this.laterality = laterality;

        this.targetReps = cloneLR(targetReps);
        this.targetWeight = cloneLR(targetWeight);

        this.restSecondsAfter = restSecondsAfter;

        this.history = history.map(cloneEntry);

        this.validate();
    }

    validate() {
        assert(typeof this.id === "string" && this.id.length > 0, "RepGroup.id is required");
        assert(typeof this.exerciseId === "string" && this.exerciseId.length > 0, "RepGroup.exerciseId is required");

        assert(
            this.laterality === Laterality.UNILATERAL || this.laterality === Laterality.BILATERAL,
            "RepGroup.laterality must be 'unilateral' or 'bilateral'"
        );

        validateReps(this.targetReps);
        validateWeight(this.targetWeight);

        assert(
            isFiniteNumber(this.restSecondsAfter) && this.restSecondsAfter >= 0,
            "RepGroup.restSecondsAfter must be a non-negative number"
        );

        assert(Array.isArray(this.history), "RepGroup.history must be an array");
        for (const e of this.history) {
            assert(isIsoDateTime(e.dateTime), "history.dateTime must be an ISO 8601 date-time string");
            validateReps(e.reps);
            validateWeight(e.weight);
        }

        // prevent duplicate dateTime keys
        const keys = this.history.map((e) => e.dateTime);
        assert(new Set(keys).size === keys.length, "RepGroup.history cannot contain duplicate dateTime keys");
    }

    /**
     * Create or update the performed values for a specific session timestamp.
     * This updates if dateTime already exists; otherwise inserts.
     *
     * @param {string} dateTime ISO 8601 date-time string
     * @param {{
     *   reps: null | number | {left:number|null,right:number|null},
     *   weight: null | number | {left:number|null,right:number|null}
     * }} data
     */
    upsertHistory(dateTime, { reps, weight }) {
        assert(isIsoDateTime(dateTime), "dateTime must be an ISO 8601 date-time string");
        validateReps(reps);
        validateWeight(weight);

        const idx = this.history.findIndex((e) => e.dateTime === dateTime);
        const entry = cloneEntry({ dateTime, reps, weight });

        if (idx >= 0) this.history[idx] = entry;
        else this.history.push(entry);

        // sort by time ascending for UI
        this.history.sort((a, b) => Date.parse(a.dateTime) - Date.parse(b.dateTime));
        return entry;
    }

    getHistory(dateTime) {
        return this.history.find((e) => e.dateTime === dateTime) ?? null;
    }

    getLatestHistory() {
        if (this.history.length === 0) return null;
        return this.history[this.history.length - 1];
    }

    static normalizeWeightTuple(weight) {
        validateWeight(weight);
        if (weight === null) return { left: null, right: null };
        if (isFiniteNumber(weight)) return { left: weight, right: weight };
        return { left: weight.left, right: weight.right };
    }

    static normalizeRepsTuple(reps) {
        validateReps(reps);
        if (reps === null) return { left: null, right: null };
        if (Number.isInteger(reps)) return { left: reps, right: reps };
        return { left: reps.left, right: reps.right };
    }

    toJSON() {
        return {
            type: "RepGroup",
            id: this.id,
            exerciseId: this.exerciseId,
            laterality: this.laterality,
            targetReps: this.targetReps,
            targetWeight: this.targetWeight,
            restSecondsAfter: this.restSecondsAfter,
            history: this.history,
        };
    }

    static fromJSON(obj) {
        return new RepGroup(obj);
    }
}