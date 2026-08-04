// pages/sessionPage/sessionResumeState.js
//
// Pure helpers for the resumable-session snapshot stored under
// "workoutSessions:active". Kept DOM-free so it can be unit tested.

import { isRepDone, pickTopMostIncomplete } from "./sessionProgress.js";

/** Map<seriesIdx, Set<repIdx>> -> [[seriesIdx, [repIdx, ...]], ...] */
export function serializeCompletedRepGroups(map) {
    if (!(map instanceof Map)) return [];
    return Array.from(map.entries()).map(([seriesIdx, done]) => [seriesIdx, Array.from(done ?? [])]);
}

/** [[seriesIdx, [repIdx, ...]], ...] -> Map<seriesIdx, Set<repIdx>> (invalid entries dropped) */
export function deserializeCompletedRepGroups(raw) {
    const map = new Map();
    for (const entry of Array.isArray(raw) ? raw : []) {
        const seriesIdx = Number(entry?.[0]);
        if (!Number.isInteger(seriesIdx) || seriesIdx < 0) continue;

        const reps = Array.isArray(entry?.[1])
            ? entry[1].map(Number).filter((n) => Number.isInteger(n) && n >= 0)
            : [];
        map.set(seriesIdx, new Set(reps));
    }
    return map;
}

/**
 * Snapshot of the live session. `nowMs`/`nowIso` are injected so callers stay
 * testable; `elapsedMs` is recomputed from the clock only while running.
 */
export function buildResumeSnapshot(session, { nowMs, nowIso }) {
    const {
        sessionId = null,
        routineId,
        startedAtIso = null,
        running = false,
        startEpochMs = null,
        elapsedMs = 0,
        currentSeriesIndex = 0,
        currentRepGroupIndex = 0,
        sessionSeriesOrder = null,
        completedRepGroups,
    } = session ?? {};

    return {
        sessionId,
        routineId,
        startedAtIso,
        elapsedMs: running && startEpochMs != null ? Math.max(0, nowMs - startEpochMs) : Math.max(0, elapsedMs),
        currentSeriesIndex,
        currentRepGroupIndex,
        sessionSeriesOrder: Array.isArray(sessionSeriesOrder) ? sessionSeriesOrder.slice() : null,
        completedRepGroups: serializeCompletedRepGroups(completedRepGroups),
        updatedAt: nowIso,
    };
}

/** A snapshot is only offered for resume if it belongs to this routine and holds progress. */
export function isResumableFor(state, routineId) {
    if (!state || typeof state !== "object") return false;
    if (!routineId || state.routineId !== routineId) return false;

    return (state.completedRepGroups?.length ?? 0) > 0 || Number(state.elapsedMs) > 0;
}

/**
 * Where the restored session should place the cursor: the saved position when it
 * still exists and is not already done, otherwise the first incomplete set.
 */
export function resolveResumePosition(state, routine, completedRepGroups) {
    const seriesCount = Array.isArray(routine?.series) ? routine.series.length : 0;
    const seriesIdx = Number(state?.currentSeriesIndex);
    const repIdx = Number(state?.currentRepGroupIndex);

    const savedIsValid =
        Number.isInteger(seriesIdx) &&
        seriesIdx >= 0 &&
        seriesIdx < seriesCount &&
        Number.isInteger(repIdx) &&
        repIdx >= 0 &&
        repIdx < (routine.series[seriesIdx]?.repGroups?.length ?? 0) &&
        !isRepDone(completedRepGroups, seriesIdx, repIdx);

    if (savedIsValid) return { seriesIdx, repIdx, sessionSeriesOrder: null };

    const pick = pickTopMostIncomplete(routine, state?.sessionSeriesOrder ?? null, completedRepGroups);
    return {
        seriesIdx: pick.seriesIdx ?? 0,
        repIdx: pick.repIdx ?? 0,
        sessionSeriesOrder: pick.sessionSeriesOrder ?? null,
    };
}
