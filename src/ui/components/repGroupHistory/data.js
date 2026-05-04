const MAX_POINTS = 30;
const DEFAULT_WINDOW_POINTS = 10;

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function toScalarLR(value) {
    if (value == null) return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;

    if (typeof value === "object") {
        const values = [];
        if (typeof value.left === "number" && Number.isFinite(value.left)) values.push(value.left);
        if (typeof value.right === "number" && Number.isFinite(value.right)) values.push(value.right);
        if (!values.length) return null;
        return values.reduce((sum, item) => sum + item, 0) / values.length;
    }

    return null;
}

function toSide(value, side) {
    if (value == null) return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "object") {
        const next = value?.[side];
        return typeof next === "number" && Number.isFinite(next) ? next : null;
    }
    return null;
}

function parseIsoMs(dateTime) {
    const ms = Date.parse(dateTime);
    return Number.isFinite(ms) ? ms : null;
}

/** From a sorted array of {t, y} points, keep only the last point per calendar day. */
function dedupeByDay(points) {
    const byDay = new Map();
    for (const p of points) {
        const day = new Date(p.t).toDateString();
        byDay.set(day, p); // later entries overwrite earlier ones
    }
    return Array.from(byDay.values());
}

export function getPoints(repGroup, field) {
    const history = Array.isArray(repGroup?.history) ? repGroup.history : [];
    const points = [];

    for (const entry of history) {
        const t = parseIsoMs(entry?.dateTime);
        const y = toScalarLR(entry?.[field]);
        if (t != null && y != null) points.push({ t, y });
    }

    points.sort((a, b) => a.t - b.t);
    const deduped = dedupeByDay(points);
    return deduped.length > MAX_POINTS ? deduped.slice(deduped.length - MAX_POINTS) : deduped;
}

export function getPointsBySide(repGroup, field) {
    const history = Array.isArray(repGroup?.history) ? repGroup.history : [];
    const left = [];
    const right = [];

    for (const entry of history) {
        const t = parseIsoMs(entry?.dateTime);
        if (t == null) continue;

        const value = entry?.[field];
        const leftValue = toSide(value, "left");
        const rightValue = toSide(value, "right");

        if (leftValue != null) left.push({ t, y: leftValue });
        if (rightValue != null) right.push({ t, y: rightValue });
    }

    left.sort((a, b) => a.t - b.t);
    right.sort((a, b) => a.t - b.t);

    const dedupedLeft = dedupeByDay(left);
    const dedupedRight = dedupeByDay(right);

    return {
        left: dedupedLeft.length > MAX_POINTS ? dedupedLeft.slice(dedupedLeft.length - MAX_POINTS) : dedupedLeft,
        right: dedupedRight.length > MAX_POINTS ? dedupedRight.slice(dedupedRight.length - MAX_POINTS) : dedupedRight,
    };
}

export function buildTimeline(seriesList) {
    const timeline = new Set();

    for (const points of seriesList) {
        for (const point of points || []) {
            if (point?.t != null) timeline.add(point.t);
        }
    }

    return Array.from(timeline).sort((a, b) => a - b);
}

export function getRepGroupTimeline(repGroup) {
    const history = Array.isArray(repGroup?.history) ? repGroup.history : [];
    const timeline = [];

    for (const entry of history) {
        const t = parseIsoMs(entry?.dateTime);
        if (t != null) timeline.push(t);
    }

    timeline.sort((a, b) => a - b);
    return timeline.filter((t, index) => index === 0 || timeline[index - 1] !== t);
}

export function getDefaultViewportState(timeline) {
    const total = timeline.length;
    const windowSize = total ? Math.min(DEFAULT_WINDOW_POINTS, total) : 1;

    return {
        windowSize,
        startIndex: Math.max(0, total - windowSize),
        focusT: null,
    };
}

export function getViewport(timeline, viewState) {
    if (!timeline.length) {
        return {
            startIndex: 0,
            endIndex: 0,
            windowSize: 1,
            minT: 0,
            maxT: 1,
            visibleTimeline: [],
        };
    }

    const windowSize = clamp(viewState?.windowSize ?? timeline.length, 1, timeline.length);
    const maxStart = Math.max(0, timeline.length - windowSize);
    const startIndex = clamp(viewState?.startIndex ?? maxStart, 0, maxStart);
    const endIndex = Math.min(timeline.length - 1, startIndex + windowSize - 1);

    return {
        startIndex,
        endIndex,
        windowSize,
        minT: timeline[startIndex],
        maxT: timeline[endIndex],
        visibleTimeline: timeline.slice(startIndex, endIndex + 1),
    };
}

export function filterPointsInRange(points, minT, maxT) {
    return (points || []).filter((point) => point.t >= minT && point.t <= maxT);
}

export function getNearestPoint(points, targetT) {
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const point of points || []) {
        const distance = Math.abs(point.t - targetT);
        if (distance < nearestDistance) {
            nearest = point;
            nearestDistance = distance;
        }
    }

    return nearest;
}

export function fmtDate(ms) {
    const date = new Date(ms);
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}`;
}

export function computeDomain(seriesList) {
    const all = seriesList.flat();
    if (!all.length) {
        return { minT: 0, maxT: 1, minY: 0, maxY: 1 };
    }

    const timestamps = all.map((point) => point.t);
    const values = all.map((point) => point.y);

    const minT = Math.min(...timestamps);
    const maxT = Math.max(...timestamps);

    let minY = Math.min(...values);
    let maxY = Math.max(...values);

    if (minY === maxY) {
        minY -= 1;
        maxY += 1;
    } else {
        const margin = (maxY - minY) * 0.1;
        minY -= margin;
        maxY += margin;
    }

    return { minT, maxT: maxT || (minT + 1), minY, maxY };
}
