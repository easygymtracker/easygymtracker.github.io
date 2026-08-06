// pages/profilePage/measurementMetrics.js
//
// Shared derivation for body-measurement charts. The summary card and the full
// history page plot the same series, so the aggregation lives here rather than
// in both of them.

import { toDayKey } from "../../ui/format.js";

/**
 * Highest value per calendar day for one measurement field, oldest first.
 *
 * Daily max rather than every reading: several weigh-ins in a day would
 * otherwise render as noise instead of a trend.
 *
 * @returns {Array<{day: string, value: number}>}
 */
export function buildDailyMax(entries, field) {
    const daily = new Map();

    for (const entry of entries) {
        const value = entry[field];
        if (value == null) continue;

        const key = toDayKey(entry.recordedAt);
        const current = daily.get(key);
        if (current == null || value > current) daily.set(key, value);
    }

    return Array.from(daily.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, value]) => ({ day, value }));
}
