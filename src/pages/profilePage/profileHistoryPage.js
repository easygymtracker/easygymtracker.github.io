import { escapeHtml } from "../../ui/dom.js";
import { t } from "../../internationalization/i18n.js";
import { formatDateTime, formatValue, parseOptionalNumber, toInputDateTime } from "../../ui/format.js";
import { lineChartSvg } from "../../ui/components/lineChart.js";
import { buildDailyMax } from "./measurementMetrics.js";








function average(entries, field) {
    const values = entries
        .map((entry) => entry[field])
        .filter((value) => value != null);
    if (!values.length) return null;
    const sum = values.reduce((acc, value) => acc + value, 0);
    return Math.round((sum / values.length) * 10) / 10;
}

function findLatest(entries, field) {
    const found = entries.find((entry) => entry[field] != null);
    return found ? found[field] : null;
}

function statsHtml(entries) {
    const newest = entries[0];
    const oldest = entries.length ? entries[entries.length - 1] : null;
    const avgWeight = average(entries, "weightKg");
    const avgFat = average(entries, "bodyFatPct");
    const avgMuscle = average(entries, "muscleKg");

    return `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:10px;">
                <article class="card" style="padding:10px;"><strong>${entries.length}</strong><div class="note">${escapeHtml(t("profileHistory.stats.entries"))}</div></article>
                <article class="card" style="padding:10px;"><strong>${escapeHtml(formatDateTime(newest?.recordedAt))}</strong><div class="note">${escapeHtml(t("profileHistory.stats.latestRecord"))}</div></article>
                <article class="card" style="padding:10px;"><strong>${escapeHtml(formatDateTime(oldest?.recordedAt))}</strong><div class="note">${escapeHtml(t("profileHistory.stats.oldestRecord"))}</div></article>
                <article class="card" style="padding:10px;"><strong>${escapeHtml(formatValue(avgWeight, " kg"))}</strong><div class="note">${escapeHtml(t("profileHistory.stats.avgWeight"))}</div></article>
                <article class="card" style="padding:10px;"><strong>${escapeHtml(formatValue(avgFat, "%"))}</strong><div class="note">${escapeHtml(t("profileHistory.stats.avgBodyFat"))}</div></article>
                <article class="card" style="padding:10px;"><strong>${escapeHtml(formatValue(avgMuscle, " kg"))}</strong><div class="note">${escapeHtml(t("profileHistory.stats.avgMuscle"))}</div></article>
      </div>
    `;
}

function chartsHtml(entries) {
    const metrics = [
                { title: t("profile.weightLabel"), field: "weightKg", color: "#6bb6ff", suffix: " kg", latest: findLatest(entries, "weightKg") },
                { title: t("profile.bodyFatLabel"), field: "bodyFatPct", color: "#f59e0b", suffix: "%", latest: findLatest(entries, "bodyFatPct") },
                { title: t("profile.muscleLabel"), field: "muscleKg", color: "#22c55e", suffix: " kg", latest: findLatest(entries, "muscleKg") },
    ];

    return metrics.map((metric) => {
        const points = buildDailyMax(entries, metric.field);
        return `
          <article class="card" style="padding:12px; display:grid; gap:10px;">
            <div style="display:flex; justify-content:space-between; gap:8px; align-items:baseline;">
              <h3 style="margin:0; font-size:15px;">${escapeHtml(metric.title)}</h3>
              <strong style="font-size:18px; color:${metric.color};">${escapeHtml(formatValue(metric.latest, metric.suffix))}</strong>
            </div>
            ${lineChartSvg(points, { color: metric.color, unit: metric.suffix, ariaLabel: t("profileHistory.metricTrendAria"), width: 340, height: 150 })}
          </article>
        `;
    }).join("");
}

function tableRowsHtml(entries) {
    return entries.map((entry, index) => `
      <tr data-entry-id="${escapeHtml(entry.id)}">
        <td style="padding:8px; border-bottom:1px solid var(--border);">${index + 1}</td>
        <td style="padding:8px; border-bottom:1px solid var(--border);">${escapeHtml(formatDateTime(entry.recordedAt))}</td>
        <td style="padding:8px; border-bottom:1px solid var(--border);">${escapeHtml(formatValue(entry.weightKg))}</td>
        <td style="padding:8px; border-bottom:1px solid var(--border);">${escapeHtml(formatValue(entry.bodyFatPct))}</td>
        <td style="padding:8px; border-bottom:1px solid var(--border);">${escapeHtml(formatValue(entry.muscleKg))}</td>
        <td style="padding:8px; border-bottom:1px solid var(--border); text-align:right;">
                    <button class="btn" type="button" data-action="edit">${escapeHtml(t("common.edit"))}</button>
                    <button class="btn danger" type="button" data-action="delete">${escapeHtml(t("common.delete"))}</button>
        </td>
      </tr>
    `).join("");
}

export function mountProfileHistoryPage({ profileStore }) {
    const statsEl = document.getElementById("profileHistoryStats");
    const chartsEl = document.getElementById("profileHistoryCharts");
    const tableBody = document.getElementById("profileHistoryTableBody");
    const emptyEl = document.getElementById("profileHistoryEmpty");

    const form = document.getElementById("profileHistoryEditForm");
    const idInput = document.getElementById("profileHistoryEditId");
    const recordedAtInput = document.getElementById("profileHistoryEditRecordedAt");
    const weightInput = document.getElementById("profileHistoryEditWeightKg");
    const fatInput = document.getElementById("profileHistoryEditBodyFatPct");
    const muscleInput = document.getElementById("profileHistoryEditMuscleKg");
    const cancelBtn = document.getElementById("btnCancelProfileHistoryEdit");

    function clearForm() {
        form.reset();
        idInput.value = "";
        recordedAtInput.value = toInputDateTime();
    }

    function fillForm(entry) {
        idInput.value = entry.id;
        recordedAtInput.value = toInputDateTime(entry.recordedAt);
        weightInput.value = entry.weightKg ?? "";
        fatInput.value = entry.bodyFatPct ?? "";
        muscleInput.value = entry.muscleKg ?? "";
    }

    function render() {
        const entries = profileStore.listEntries();
        statsEl.innerHTML = statsHtml(entries);
        chartsEl.innerHTML = chartsHtml(entries);
        tableBody.innerHTML = tableRowsHtml(entries);
        emptyEl.style.display = entries.length ? "none" : "block";
    }

    tableBody.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        const row = button.closest("tr[data-entry-id]");
        const id = row?.getAttribute("data-entry-id");
        if (!id) return;

        if (button.dataset.action === "delete") {
            if (!confirm(t("profileHistory.confirm.deleteEntry"))) return;
            profileStore.removeEntry(id);
            if (idInput.value === id) clearForm();
            render();
            return;
        }

        if (button.dataset.action === "edit") {
            const entry = profileStore.listEntries().find((item) => item.id === id);
            if (!entry) return;
            fillForm(entry);
        }
    });

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const id = idInput.value;
        if (!id) {
            alert(t("profileHistory.alert.selectEntry"));
            return;
        }

        const weightKg = parseOptionalNumber(weightInput.value);
        const bodyFatPct = parseOptionalNumber(fatInput.value);
        const muscleKg = parseOptionalNumber(muscleInput.value);

        if (weightKg == null && bodyFatPct == null && muscleKg == null) {
            alert(t("profileHistory.alert.metricRequired"));
            return;
        }

        profileStore.updateEntry(id, {
            recordedAt: recordedAtInput.value || toInputDateTime(),
            weightKg,
            bodyFatPct,
            muscleKg,
        });

        clearForm();
        render();
    });

    cancelBtn.addEventListener("click", clearForm);

    clearForm();
    return { render };
}
