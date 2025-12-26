
export function assert(condition, message) {
    if (!condition) throw new Error(message);
}

export function isFiniteNumber(x) {
    return typeof x === "number" && Number.isFinite(x);
}

export function asStringOrEmpty(x) {
    return x == null ? "" : String(x);
}