// Reps and weights share one shape (number | {left, right}); the generic
// handling lives in ui/sidedValue.js. These aliases keep the reading names the
// session code already uses.
import { isSameSided, normalizeSided } from "../../ui/sidedValue.js";

export const normalizeWeight = normalizeSided;
export const normalizeReps = normalizeSided;
export const isSameWeight = isSameSided;

export function resolveExerciseName(seriesItem, exerciseStore, unknownLabel) {
    const id = seriesItem?.exerciseId;
    if (!id) return unknownLabel;

    const exercise =
        exerciseStore?.getById?.(id) ||
        exerciseStore?.list?.()?.find?.((item) => item.id === id) ||
        null;

    return exercise?.name || exercise?.description || id;
}

export function formatSideValue(value) {
    if (value == null) return "—";
    if (typeof value === "number") return String(value);
    if (typeof value === "object") {
        const left = value.left ?? "—";
        const right = value.right ?? "—";
        return `${left}/${right}`;
    }

    return String(value);
}

export function resolveRepValue(repGroup, field) {
    const history = Array.isArray(repGroup?.history) ? repGroup.history : [];
    const last = history.length ? history[history.length - 1] : null;

    if (field === "targetWeight") return last?.weight ?? repGroup?.targetWeight ?? null;
    if (field === "targetReps") return last?.reps ?? repGroup?.targetReps ?? null;

    return null;
}