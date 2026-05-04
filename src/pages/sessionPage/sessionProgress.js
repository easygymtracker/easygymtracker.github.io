export function hasCompletedAnyRep(completedRepGroups, seriesIdx) {
    return completedRepGroups.get(seriesIdx)?.size > 0;
}

export function isRepDone(completedRepGroups, seriesIdx, repIdx) {
    return completedRepGroups.get(seriesIdx)?.has(repIdx) === true;
}

export function markRepDone(completedRepGroups, seriesIdx, repIdx) {
    if (!completedRepGroups.has(seriesIdx)) completedRepGroups.set(seriesIdx, new Set());
    completedRepGroups.get(seriesIdx).add(repIdx);
}

export function shiftCompletedAfterInsert(completedRepGroups, seriesIdx, insertIdx) {
    const done = completedRepGroups.get(seriesIdx);
    if (!done || done.size === 0) return;

    const shifted = new Set();
    for (const idx of done) {
        shifted.add(idx >= insertIdx ? idx + 1 : idx);
    }
    completedRepGroups.set(seriesIdx, shifted);
}

export function statusForRep(sessionState, seriesIdx, repIdx) {
    if (isRepDone(sessionState.completedRepGroups, seriesIdx, repIdx)) return "done";
    if (seriesIdx === sessionState.currentSeriesIndex && repIdx === sessionState.currentRepGroupIndex) return "active";
    return "todo";
}

export function statusForSeries(sessionState, seriesIdx, routine) {
    const groups = routine?.series?.[seriesIdx]?.repGroups ?? [];
    if (!groups.length) return seriesIdx === sessionState.currentSeriesIndex ? "active" : "todo";

    const allDone = groups.every((_, index) => isRepDone(sessionState.completedRepGroups, seriesIdx, index));
    if (allDone) return "done";
    if (seriesIdx === sessionState.currentSeriesIndex) return "active";
    return "todo";
}

export function recomputeCompletedSeries(routine, completedRepGroups) {
    const series = routine?.series ?? [];
    const nextCompleted = new Set();

    for (let seriesIdx = 0; seriesIdx < series.length; seriesIdx += 1) {
        const groups = Array.isArray(series[seriesIdx]?.repGroups) ? series[seriesIdx].repGroups : [];
        if (!groups.length) continue;

        const allDone = groups.every((_, repIdx) => isRepDone(completedRepGroups, seriesIdx, repIdx));
        if (allDone) nextCompleted.add(seriesIdx);
    }

    return nextCompleted;
}

export function ensureSessionSeriesOrder(routine, sessionSeriesOrder) {
    const series = Array.isArray(routine?.series) ? routine.series : [];
    if (!sessionSeriesOrder || sessionSeriesOrder.length !== series.length) {
        return series.map((_, index) => index);
    }

    return sessionSeriesOrder;
}

export function getFirstIncompleteRepIndex(seriesIdx, routine, completedRepGroups) {
    const groups = Array.isArray(routine?.series?.[seriesIdx]?.repGroups)
        ? routine.series[seriesIdx].repGroups
        : [];
    if (!groups.length) return null;

    for (let index = 0; index < groups.length; index += 1) {
        if (!isRepDone(completedRepGroups, seriesIdx, index)) return index;
    }

    return null;
}

export function getNextIncompleteRepAfter(seriesIdx, startAfterRepIdx, routine, completedRepGroups) {
    const groups = Array.isArray(routine?.series?.[seriesIdx]?.repGroups)
        ? routine.series[seriesIdx].repGroups
        : [];
    if (!groups.length) return null;

    for (let index = (startAfterRepIdx ?? -1) + 1; index < groups.length; index += 1) {
        if (!isRepDone(completedRepGroups, seriesIdx, index)) return index;
    }

    return null;
}

export function pickTopMostIncomplete(routine, sessionSeriesOrder, completedRepGroups) {
    const order = ensureSessionSeriesOrder(routine, sessionSeriesOrder);
    for (const seriesIdx of order) {
        const repIdx = getFirstIncompleteRepIndex(seriesIdx, routine, completedRepGroups);
        if (repIdx != null) {
            return { seriesIdx, repIdx, sessionSeriesOrder: order };
        }
    }

    return { seriesIdx: null, repIdx: null, sessionSeriesOrder: order };
}

export function advanceToNext(routine, sessionState) {
    const nextInSame = getNextIncompleteRepAfter(
        sessionState.currentSeriesIndex,
        sessionState.currentRepGroupIndex,
        routine,
        sessionState.completedRepGroups,
    );
    if (nextInSame != null) {
        return {
            currentSeriesIndex: sessionState.currentSeriesIndex,
            currentRepGroupIndex: nextInSame,
        };
    }

    const firstInSame = getFirstIncompleteRepIndex(
        sessionState.currentSeriesIndex,
        routine,
        sessionState.completedRepGroups,
    );
    if (firstInSame != null) {
        return {
            currentSeriesIndex: sessionState.currentSeriesIndex,
            currentRepGroupIndex: firstInSame,
        };
    }

    const pick = pickTopMostIncomplete(routine, sessionState.sessionSeriesOrder, sessionState.completedRepGroups);
    if (pick.seriesIdx != null) {
        return {
            currentSeriesIndex: pick.seriesIdx,
            currentRepGroupIndex: pick.repIdx,
            sessionSeriesOrder: pick.sessionSeriesOrder,
        };
    }

    return null;
}