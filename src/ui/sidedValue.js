// ui/sidedValue.js
//
// Reps and weights are either a single number (bilateral) or a {left, right}
// pair (unilateral). Three modules had grown their own predicate and normaliser
// for that shape, each subtly different — this is the single definition.
//
// Rendering stays with the caller on purpose: the history table wants
// "L:8 / R:8 kg" while the session screen wants a terse "8/8".

/** True for the {left, right} shape, however partially filled. */
export function isSided(value) {
    return value !== null && typeof value === "object" && ("left" in value || "right" in value);
}

/** Coerces any accepted shape to {left, right}, spreading a plain number. */
export function toSided(value) {
    if (value == null) return { left: null, right: null };
    if (typeof value === "number") return { left: value, right: value };
    return { left: value.left ?? null, right: value.right ?? null };
}

/**
 * Normalises for storage: numbers and null pass through unchanged, so a
 * bilateral value never silently becomes a pair.
 */
export function normalizeSided(value) {
    if (value === null) return null;
    if (typeof value === "number") return value;
    return { left: value?.left ?? null, right: value?.right ?? null };
}

/** Structural equality across both shapes. */
export function isSameSided(a, b) {
    const left = normalizeSided(a);
    const right = normalizeSided(b);

    if (left === null && right === null) return true;
    if (typeof left === "number" && typeof right === "number") return left === right;
    if (left && right && typeof left === "object" && typeof right === "object") {
        return left.left === right.left && left.right === right.right;
    }

    return false;
}
