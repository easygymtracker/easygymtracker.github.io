export function normalizeWeight(weight) {
    if (weight === null) return null;
    if (typeof weight === "number") return weight;
    return { left: weight?.left ?? null, right: weight?.right ?? null };
}

export function normalizeReps(reps) {
    if (reps === null) return null;
    if (typeof reps === "number") return reps;
    return { left: reps?.left ?? null, right: reps?.right ?? null };
}

export function isSameWeight(a, b) {
    const left = normalizeWeight(a);
    const right = normalizeWeight(b);

    if (left === null && right === null) return true;
    if (typeof left === "number" && typeof right === "number") return left === right;
    if (typeof left === "object" && typeof right === "object") {
        return left.left === right.left && left.right === right.right;
    }

    return false;
}

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