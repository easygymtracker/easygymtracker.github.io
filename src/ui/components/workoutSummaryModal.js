// src/ui/components/workoutSummaryModal.js

import { t } from "/src/internationalization/i18n.js";
import { escapeHtml } from "/src/ui/dom.js";
import { formatMs } from "/src/utils/numberFormat.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function toScalarReps(reps) {
    if (reps == null) return null;
    if (typeof reps === "number") return reps;
    const l = typeof reps.left === "number" ? reps.left : 0;
    const r = typeof reps.right === "number" ? reps.right : 0;
    return l + r;
}

function toVolumeFromEntry(entry) {
    const { reps, weight } = entry;
    if (reps == null || weight == null) return 0;

    // bilateral
    if (typeof reps === "number" && typeof weight === "number") {
        return reps * weight;
    }
    // unilateral
    if (typeof reps === "object" && typeof weight === "object") {
        const lv = ((reps.left ?? 0) * (weight.left ?? 0));
        const rv = ((reps.right ?? 0) * (weight.right ?? 0));
        return lv + rv;
    }
    // mixed edge cases
    const scalar = (v) => {
        if (typeof v === "number") return v;
        if (v == null) return 0;
        return ((v.left ?? 0) + (v.right ?? 0)) / 2;
    };
    return scalar(reps) * scalar(weight);
}

// ─── weight comparison table (ordered lightest → heaviest) ────────────────────

const COMPARISONS = [
    { key: "session.summary.compare.bowlingBall", kg: 7,    icon: "🎳" },
    { key: "session.summary.compare.cement",      kg: 25,   icon: "🧱" },
    { key: "session.summary.compare.labrador",    kg: 30,   icon: "🐕" },
    { key: "session.summary.compare.person",      kg: 80,   icon: "🧍" },
    { key: "session.summary.compare.gorilla",     kg: 180,  icon: "🦍" },
    { key: "session.summary.compare.car",         kg: 1400, icon: "🚗" },
    { key: "session.summary.compare.elephant",    kg: 4500, icon: "🐘" },
];

function pickComparison(totalKg) {
    if (!totalKg || totalKg <= 0) return null;
    // Pick the heaviest reference object where count >= 1
    for (let i = COMPARISONS.length - 1; i >= 0; i--) {
        const count = totalKg / COMPARISONS[i].kg;
        if (count >= 1) {
            return { ...COMPARISONS[i], count: Math.round(count) };
        }
    }
    return { ...COMPARISONS[0], count: Math.round(totalKg / COMPARISONS[0].kg) };
}

// ─── stats computation ────────────────────────────────────────────────────────

export function computeSessionStats(routine, sessionStartIso) {
    let totalVolume = 0;
    let totalReps = 0;
    let totalSets = 0;
    const exercises = [];

    for (const series of routine?.series ?? []) {
        let exSets = 0;
        let exReps = 0;
        let exVolume = 0;

        const exName = series?.exerciseName
            ?? series?.exercise?.name
            ?? t("session.exercise.unknown")
            ?? "Exercise";

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

// ─── motivational message ─────────────────────────────────────────────────────

function motivationalLine(stats, durationMs) {
    const minutes = Math.round(durationMs / 60000);
    const { totalSets, totalVolume } = stats;

    if (totalSets === 0) return t("session.summary.motivational.justStarted") || "Every session counts. See you next time! 🌱";
    if (totalVolume > 5000)  return t("session.summary.motivational.beast")       || "Absolute beast mode. 🔥";
    if (totalVolume > 2000)  return t("session.summary.motivational.strong")      || "Seriously strong effort. 💪";
    if (minutes > 60)        return t("session.summary.motivational.endurance")   || "Over an hour of work. That's dedication. 🏆";
    if (totalSets >= 15)     return t("session.summary.motivational.volume")      || "High-volume session. Your body will thank you. 💥";
    return t("session.summary.motivational.done") || "Workout done. Keep showing up! 👊";
}

// ─── modal ────────────────────────────────────────────────────────────────────

export function openWorkoutSummaryModal({ routine, sessionStartIso, durationMs }) {
    return new Promise((resolve) => {
        const stats = computeSessionStats(routine, sessionStartIso);
        const { totalVolume, totalReps, totalSets, exercises } = stats;

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
                <td>${ex.volume > 0 ? (Math.round(ex.volume) + " kg") : "—"}</td>
            </tr>
        `).join("");

        modal.innerHTML = `
            <div class="summaryHeader">
                <div class="summaryIcon" aria-hidden="true">🏁</div>
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
                            .replace("{count}", comparison.count)
                            .replace("{thing}", comparisonLabel)
                    )}
                </span>
            </div>
            ` : ""}

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
            if (e.key === "Escape") { document.removeEventListener("keydown", onKey); close(); }
        });
    });
}
