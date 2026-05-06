// src/ui/components/workoutSummaryModal.js

import { t } from "/src/internationalization/i18n.js";
import { escapeHtml } from "/src/ui/dom.js";
import { formatMs } from "/src/utils/numberFormat.js";

// --- helpers ---

function toScalarReps(reps) {
    if (reps == null) return null;
    if (typeof reps === "number") return reps;
    const l = typeof reps.left === "number" ? reps.left : 0;
    const r = typeof reps.right === "number" ? reps.right : 0;
    return l + r;
}

function toScalarWeight(weight) {
    if (weight == null) return null;
    if (typeof weight === "number") return weight;
    const l = typeof weight.left === "number" ? weight.left : 0;
    const r = typeof weight.right === "number" ? weight.right : 0;
    return l + r;
}

function toVolumeFromEntry(entry) {
    const { reps, weight } = entry;
    if (reps == null || weight == null) return 0;

    if (typeof reps === "number" && typeof weight === "number") {
        return reps * weight;
    }

    if (typeof reps === "object" && typeof weight === "object") {
        const lv = (reps.left ?? 0) * (weight.left ?? 0);
        const rv = (reps.right ?? 0) * (weight.right ?? 0);
        return lv + rv;
    }

    const scalar = (v) => {
        if (typeof v === "number") return v;
        if (v == null) return 0;
        return ((v.left ?? 0) + (v.right ?? 0)) / 2;
    };

    return scalar(reps) * scalar(weight);
}

function resolveExerciseLabel(series, resolveExerciseName) {
    if (typeof resolveExerciseName === "function") {
        const resolved = resolveExerciseName(series);
        if (resolved && String(resolved).trim()) return String(resolved).trim();
    }

    return (
        series?.exerciseName ??
        series?.exercise?.name ??
        t("session.exercise.unknown") ??
        "Exercise"
    );
}

// --- weight comparison table (ordered lightest -> heaviest) ---

const COMPARISONS = [
    { key: "session.summary.compare.bowlingBall", kg: 7, icon: "\uD83C\uDFB3" },
    { key: "session.summary.compare.cement", kg: 25, icon: "\uD83E\uDDF1" },
    { key: "session.summary.compare.labrador", kg: 30, icon: "\uD83D\uDC36" },
    { key: "session.summary.compare.person", kg: 80, icon: "\uD83E\uDDD1" },
    { key: "session.summary.compare.gorilla", kg: 180, icon: "\uD83E\uDD8D" },
    { key: "session.summary.compare.car", kg: 1400, icon: "\uD83D\uDE97" },
    { key: "session.summary.compare.elephant", kg: 4500, icon: "\uD83D\uDC18" },
];

function pickComparison(totalKg) {
    if (!totalKg || totalKg <= 0) return null;

    for (let i = COMPARISONS.length - 1; i >= 0; i--) {
        const rawCount = totalKg / COMPARISONS[i].kg;
        if (rawCount >= 1) {
            const count = rawCount >= 10
                ? Math.round(rawCount)
                : Math.round(rawCount * 10) / 10;
            return { ...COMPARISONS[i], count };
        }
    }

    const smallestRawCount = totalKg / COMPARISONS[0].kg;
    return {
        ...COMPARISONS[0],
        count: Math.max(0.1, Math.round(smallestRawCount * 10) / 10),
    };
}

// --- stats computation ---

export function computeSessionPRs(routine, sessionStartIso, { resolveExerciseName } = {}) {
    const previousByExercise = new Map();
    const currentByExercise = new Map();

    for (const series of routine?.series ?? []) {
        const exName = resolveExerciseLabel(series, resolveExerciseName);

        for (const rg of series?.repGroups ?? []) {
            for (const entry of rg?.history ?? []) {
                if (!entry?.dateTime) continue;

                const reps = toScalarReps(entry.reps) ?? 0;
                const weight = toScalarWeight(entry.weight) ?? 0;
                const volume = toVolumeFromEntry(entry) ?? 0;

                const target = entry.dateTime < sessionStartIso
                    ? previousByExercise
                    : currentByExercise;

                const prev = target.get(exName) ?? { maxReps: 0, maxWeight: 0, maxVolume: 0 };
                prev.maxReps = Math.max(prev.maxReps, reps);
                prev.maxWeight = Math.max(prev.maxWeight, weight);
                prev.maxVolume = Math.max(prev.maxVolume, volume);
                target.set(exName, prev);
            }
        }
    }

    const byExercise = [];
    for (const [exercise, current] of currentByExercise.entries()) {
        const prev = previousByExercise.get(exercise) ?? { maxReps: 0, maxWeight: 0, maxVolume: 0 };
        const weightPr = current.maxWeight > prev.maxWeight && current.maxWeight > 0;
        const repsPr = current.maxReps > prev.maxReps && current.maxReps > 0;
        const volumePr = current.maxVolume > prev.maxVolume && current.maxVolume > 0;

        if (weightPr || repsPr || volumePr) {
            byExercise.push({ exercise, weightPr, repsPr, volumePr });
        }
    }

    return {
        totalPrs: byExercise.reduce(
            (acc, item) => acc + Number(item.weightPr) + Number(item.repsPr) + Number(item.volumePr),
            0
        ),
        byExercise,
    };
}

export function computeSessionStats(routine, sessionStartIso, { resolveExerciseName } = {}) {
    let totalVolume = 0;
    let totalReps = 0;
    let totalSets = 0;
    const exercises = [];

    for (const series of routine?.series ?? []) {
        let exSets = 0;
        let exReps = 0;
        let exVolume = 0;

        const exName = resolveExerciseLabel(series, resolveExerciseName);

        for (const rg of series?.repGroups ?? []) {
            for (const entry of rg?.history ?? []) {
                if (!entry?.dateTime || entry.dateTime < sessionStartIso) continue;

                const reps = toScalarReps(entry.reps);
                const vol = toVolumeFromEntry(entry);

                totalSets++;
                exSets++;

                if (reps != null) {
                    totalReps += reps;
                    exReps += reps;
                }

                totalVolume += vol;
                exVolume += vol;
            }
        }

        if (exSets > 0) {
            exercises.push({ name: exName, sets: exSets, reps: exReps, volume: exVolume });
        }
    }

    return { totalVolume, totalReps, totalSets, exercises };
}

// --- motivational message ---

function motivationalLine(stats, durationMs) {
    const minutes = Math.round(durationMs / 60000);
    const { totalSets, totalVolume } = stats;

    if (totalSets === 0) return t("session.summary.motivational.justStarted") || "Every session counts. See you next time! \uD83D\uDCAA";
    if (totalVolume > 5000) return t("session.summary.motivational.beast") || "Absolute beast mode. \uD83D\uDD25";
    if (totalVolume > 2000) return t("session.summary.motivational.strong") || "Seriously strong effort. \uD83D\uDCAA";
    if (minutes > 60) return t("session.summary.motivational.endurance") || "Over an hour of work. That's dedication. \u23F1\uFE0F";
    if (totalSets >= 15) return t("session.summary.motivational.volume") || "High-volume session. Your body will thank you. \uD83D\uDCAF";
    return t("session.summary.motivational.done") || "Workout done. Keep showing up! \uD83D\uDC4A";
}

// --- modal ---

export function openWorkoutSummaryModal({ routine, sessionStartIso, durationMs, resolveExerciseName }) {
    return new Promise((resolve) => {
        const stats = computeSessionStats(routine, sessionStartIso, { resolveExerciseName });
        const { totalVolume, totalReps, totalSets, exercises } = stats;
        const prDetection = computeSessionPRs(routine, sessionStartIso, { resolveExerciseName });

        const comparison = totalVolume > 0 ? pickComparison(totalVolume) : null;
        const comparisonLabel = comparison
            ? t(comparison.key) || comparison.key.split(".").pop()
            : null;

        const fmtVol = totalVolume >= 1000
            ? (totalVolume / 1000).toFixed(1) + " t"
            : Math.round(totalVolume) + " kg";

        const overlay = document.createElement("div");
        overlay.className = "modalOverlay";

        const modal = document.createElement("div");
        modal.className = "modalCard workoutSummaryModal";

        const exerciseRows = exercises.map((ex) => `
            <tr>
                <td>${escapeHtml(ex.name)}</td>
                <td>${ex.sets}</td>
                <td>${ex.reps}</td>
                <td>${ex.volume > 0 ? (Math.round(ex.volume) + " kg") : "\u2014"}</td>
            </tr>
        `).join("");

        const prRows = (prDetection?.byExercise ?? []).map((item) => {
            const badges = [
                item.weightPr ? (t("session.summary.pr.weight") || "Weight") : null,
                item.repsPr ? (t("session.summary.pr.reps") || "Reps") : null,
                item.volumePr ? (t("session.summary.pr.volume") || "Volume") : null,
            ].filter(Boolean);

            return `
                <li class="summaryPrItem">
                    <span class="summaryPrExercise">${escapeHtml(item.exercise)}</span>
                    <span class="summaryPrBadges">${badges.map((label) => `<span class="summaryPrBadge">${escapeHtml(label)}</span>`).join("")}</span>
                </li>
            `;
        }).join("");

        modal.innerHTML = `
            <div class="summaryHeader">
                <div class="summaryIcon" aria-hidden="true">\u2705</div>
                <h3>${escapeHtml(t("session.summary.title") || "Workout complete!")}</h3>
                <p class="muted summaryMotivational">${escapeHtml(motivationalLine(stats, durationMs))}</p>
            </div>

            <div class="summaryKpis">
                <div class="summaryKpi">
                    <span class="summaryKpiValue">${escapeHtml(formatMs(durationMs))}</span>
                    <span class="summaryKpiLabel muted">${escapeHtml(t("session.summary.duration") || "Duration")}</span>
                </div>
                <div class="summaryKpi">
                    <span class="summaryKpiValue">${totalSets}</span>
                    <span class="summaryKpiLabel muted">${escapeHtml(t("session.summary.sets") || "Sets done")}</span>
                </div>
                <div class="summaryKpi">
                    <span class="summaryKpiValue">${totalReps}</span>
                    <span class="summaryKpiLabel muted">${escapeHtml(t("session.summary.totalReps") || "Total reps")}</span>
                </div>
                <div class="summaryKpi">
                    <span class="summaryKpiValue">${escapeHtml(fmtVol)}</span>
                    <span class="summaryKpiLabel muted">${escapeHtml(t("session.summary.volume") || "Volume lifted")}</span>
                </div>
            </div>

            ${comparison ? `
            <div class="summaryComparison">
                <span class="summaryComparisonIcon" aria-hidden="true">${comparison.icon}</span>
                <span class="summaryComparisonText">
                    ${escapeHtml(
                        (t("session.summary.comparison") || "Like lifting {count} {thing}")
                            .replace("{count}", String(comparison.count))
                            .replace("{thing}", comparisonLabel)
                    )}
                </span>
            </div>
            ` : ""}

            <div class="summaryPrs">
                ${prRows ? `
                <details class="summaryPrDetails">
                    <summary class="summaryPrSummary">
                        <span class="summaryPrIcon" aria-hidden="true">\uD83C\uDFC6</span>
                        <span>${escapeHtml(
                            (t("session.summary.prsSummary") || "{count} new PR(s)")
                                .replace("{count}", String(prDetection.totalPrs))
                        )}</span>
                    </summary>
                    <ul class="summaryPrList">${prRows}</ul>
                </details>
                ` : `<p class="muted summaryPrNone">${escapeHtml(t("session.summary.pr.none") || "No new PRs in this session.")}</p>`}
            </div>

            ${exercises.length > 0 ? `
            <div class="summaryBreakdown">
                <p class="summaryBreakdownTitle muted">${escapeHtml(t("session.summary.breakdown") || "Breakdown")}</p>
                <table class="summaryTable">
                    <thead>
                        <tr>
                            <th>${escapeHtml(t("session.exercise") || "Exercise")}</th>
                            <th>${escapeHtml(t("session.sets") || "Sets")}</th>
                            <th>${escapeHtml(t("session.reps") || "Reps")}</th>
                            <th>${escapeHtml(t("session.summary.volume") || "Volume")}</th>
                        </tr>
                    </thead>
                    <tbody>${exerciseRows}</tbody>
                </table>
            </div>
            ` : `<p class="muted" style="text-align:center; margin-top:12px;">${escapeHtml(t("session.summary.noData") || "No sets recorded this session.")}</p>`}

            <div class="modalActions" style="margin-top:20px;">
                <button type="button" class="btn summaryCloseBtn" data-action="close" style="flex:1;">
                    ${escapeHtml(t("session.summary.close") || "Close")}
                </button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        function close() {
            overlay.remove();
            resolve();
        }

        modal.querySelector('[data-action="close"]').onclick = close;

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) close();
        });

        document.addEventListener("keydown", function onKey(e) {
            if (e.key === "Escape") {
                document.removeEventListener("keydown", onKey);
                close();
            }
        });
    });
}
