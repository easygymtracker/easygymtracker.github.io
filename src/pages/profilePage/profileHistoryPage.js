import { escapeHtml } from "../../ui/dom.js";
import { t } from "../../internationalization/i18n.js";

function toInputDateTimeValue(value) {
    const date = value ? new Date(value) : new Date();
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function parseOptionalNumber(value) {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatValue(value, suffix = "") {
    if (value == null) return t("common.dash");
    return `${value}${suffix}`;
}

function formatRecordedAt(value) {
    if (!value) return t("common.dash");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function getDayKey(value) {
    return String(value || "").slice(0, 10);
}

function buildDailyMax(entries, field) {
    const daily = new Map();
    entries.forEach((entry) => {
        const value = entry[field];
        if (value == null) return;
        const key = getDayKey(entry.recordedAt);
        const current = daily.get(key);
        if (current == null || value > current) {
            daily.set(key, value);
        }
    });

    return Array.from(daily.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, value]) => ({ day, value }));
}

function lineChartSvg(points, color, unit) {
    if (!points.length) {
        return `<div class="note">${escapeHtml(t("profileHistory.noDataYet"))}</div>`;
    }

    const width = 340;
    const height = 150;
    const padL = 30;
    const padR = 12;
    const padT = 12;
    const padB = 24;
    const min = Math.min(...points.map((point) => point.value));
    const max = Math.max(...points.map((point) => point.value));
    const range = max - min || 1;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const coords = points.map((point, index) => {
        const x = padL + (plotW * (points.length === 1 ? 0.5 : index / (points.length - 1)));
        const y = padT + (plotH * (1 - ((point.value - min) / range)));
        return { ...point, x, y };
    });

    const polyline = coords.map((point) => `${point.x},${point.y}`).join(" ");
    const dots = coords.map((point) => `
      <circle cx="${point.x}" cy="${point.y}" r="3.5" fill="${color}">
        <title>${escapeHtml(point.day)}: ${escapeHtml(String(point.value))}${escapeHtml(unit)}</title>
      </circle>
    `).join("");

    return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(t("profileHistory.metricTrendAria"))}" style="width:100%; height:auto; display:block;">
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${height - padB}" stroke="var(--border)" />
        <line x1="${padL}" y1="${height - padB}" x2="${width - padR}" y2="${height - padB}" stroke="var(--border)" />
        <text x="${padL}" y="${padT - 2}" fill="var(--muted)" font-size="10">${escapeHtml(String(max))}${escapeHtml(unit)}</text>
        <polyline fill="none" stroke="${color}" stroke-width="2.5" points="${polyline}" />
        ${dots}
      </svg>
    `;
}

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
                <article class="card" style="padding:10px;"><strong>${escapeHtml(formatRecordedAt(newest?.recordedAt))}</strong><div class="note">${escapeHtml(t("profileHistory.stats.latestRecord"))}</div></article>
                <article class="card" style="padding:10px;"><strong>${escapeHtml(formatRecordedAt(oldest?.recordedAt))}</strong><div class="note">${escapeHtml(t("profileHistory.stats.oldestRecord"))}</div></article>
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
            ${lineChartSvg(points, metric.color, metric.suffix)}
          </article>
        `;
    }).join("");
}

function tableRowsHtml(entries) {
    return entries.map((entry, index) => `
      <tr data-entry-id="${escapeHtml(entry.id)}">
        <td style="padding:8px; border-bottom:1px solid var(--border);">${index + 1}</td>
        <td style="padding:8px; border-bottom:1px solid var(--border);">${escapeHtml(formatRecordedAt(entry.recordedAt))}</td>
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
        recordedAtInput.value = toInputDateTimeValue();
    }

    function fillForm(entry) {
        idInput.value = entry.id;
        recordedAtInput.value = toInputDateTimeValue(entry.recordedAt);
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
            recordedAt: recordedAtInput.value || toInputDateTimeValue(),
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
