import { escapeHtml } from "../../ui/dom.js";
import { buildProfileExportV1, downloadProfileJson } from "../../export/profileExport.js";
import { importProfileFromExport } from "../../import/profileImport.js";

function toInputDateTimeValue(date = new Date()) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function parseOptionalNumber(value) {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatValue(value, suffix) {
    if (value == null) return "—";
    return `${value}${suffix}`;
}

function formatRecordedAt(value) {
    if (!value) return "—";
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
        return `<div class="note">No data yet.</div>`;
    }

    const width = 320;
    const height = 140;
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
    const startLabel = escapeHtml(coords[0].day.slice(5));
    const endLabel = escapeHtml(coords[coords.length - 1].day.slice(5));

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily max trend chart" style="width:100%; height:auto; display:block;">
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${height - padB}" stroke="var(--border)" />
        <line x1="${padL}" y1="${height - padB}" x2="${width - padR}" y2="${height - padB}" stroke="var(--border)" />
        <text x="${padL}" y="${padT - 2}" fill="var(--muted)" font-size="10">${escapeHtml(String(max))}${escapeHtml(unit)}</text>
        <text x="${padL}" y="${height - padB + 14}" fill="var(--muted)" font-size="10">${startLabel}</text>
        <text x="${width - padR}" y="${height - padB + 14}" text-anchor="end" fill="var(--muted)" font-size="10">${endLabel}</text>
        <polyline fill="none" stroke="${color}" stroke-width="2.5" points="${polyline}" />
        ${dots}
      </svg>
    `;
}

function metricCard({ title, valueSuffix, color, entries, field }) {
    const points = buildDailyMax(entries, field);
    const latest = entries.find((entry) => entry[field] != null)?.[field] ?? null;

    return `
      <article class="card" style="padding:12px; display:grid; gap:10px;">
        <div style="display:flex; align-items:baseline; justify-content:space-between; gap:10px;">
          <h3 style="margin:0; font-size:15px;">${escapeHtml(title)}</h3>
          <strong style="font-size:18px; color:${color};">${escapeHtml(formatValue(latest, valueSuffix))}</strong>
        </div>
        ${lineChartSvg(points, color, valueSuffix)}
        <p class="note" style="margin:0;">Chart shows the maximum recorded value for each day.</p>
      </article>
    `;
}

function entryRow(entry) {
    return `
      <div class="card" data-entry-id="${escapeHtml(entry.id)}" style="padding:12px; display:grid; gap:8px;">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
          <div>
            <strong>${escapeHtml(formatRecordedAt(entry.recordedAt))}</strong>
            <div class="note">Weight: ${escapeHtml(formatValue(entry.weightKg, " kg"))} · Body fat: ${escapeHtml(formatValue(entry.bodyFatPct, "%"))} · Muscle: ${escapeHtml(formatValue(entry.muscleKg, " kg"))}</div>
          </div>
          <button class="btn danger" type="button" data-action="delete-entry">Delete</button>
        </div>
      </div>
    `;
}

export function mountProfilePage({ profileStore }) {
    const form = document.getElementById("profileForm");
    const recordedAtInput = document.getElementById("profileRecordedAt");
    const weightInput = document.getElementById("profileWeightKg");
    const bodyFatInput = document.getElementById("profileBodyFatPct");
    const muscleInput = document.getElementById("profileMuscleKg");
    const charts = document.getElementById("profileCharts");
    const list = document.getElementById("profileEntryList");
    const empty = document.getElementById("profileEmpty");
    const clearBtn = document.getElementById("btnClearProfileEntries");
    const exportBtn = document.getElementById("btnExportProfile");
    const importBtn = document.getElementById("btnImportProfile");
    const importFileInput = document.getElementById("profileImportFile");

    function resetForm() {
        form.reset();
        recordedAtInput.value = toInputDateTimeValue();
    }

    function render() {
        const entries = profileStore.listEntries();
        charts.innerHTML = [
            metricCard({ title: "Weight", valueSuffix: " kg", color: "#6bb6ff", entries, field: "weightKg" }),
            metricCard({ title: "Body fat", valueSuffix: "%", color: "#f59e0b", entries, field: "bodyFatPct" }),
            metricCard({ title: "Muscle", valueSuffix: " kg", color: "#22c55e", entries, field: "muscleKg" }),
        ].join("");

        list.innerHTML = entries.map(entryRow).join("");
        empty.style.display = entries.length === 0 ? "block" : "none";
        clearBtn.style.display = entries.length === 0 ? "none" : "inline-flex";
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const recordedAt = recordedAtInput.value || toInputDateTimeValue();
        const weightKg = parseOptionalNumber(weightInput.value);
        const bodyFatPct = parseOptionalNumber(bodyFatInput.value);
        const muscleKg = parseOptionalNumber(muscleInput.value);

        if (weightKg == null && bodyFatPct == null && muscleKg == null) {
            alert("Add at least one measurement before saving.");
            return;
        }

        profileStore.addEntry({ recordedAt, weightKg, bodyFatPct, muscleKg });
        resetForm();
        render();
    });

    list.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action='delete-entry']");
        if (!button) return;
        const card = button.closest("[data-entry-id]");
        const id = card?.getAttribute("data-entry-id");
        if (!id) return;
        profileStore.removeEntry(id);
        render();
    });

    clearBtn.addEventListener("click", () => {
        const ok = confirm("Delete all saved profile measurements?");
        if (!ok) return;
        profileStore.clearAll();
        render();
    });

    exportBtn.addEventListener("click", () => {
        const data = buildProfileExportV1({ profileStore });
        downloadProfileJson({ data });
    });

    importBtn.addEventListener("click", () => {
        importFileInput.value = "";
        importFileInput.click();
    });

    importFileInput.addEventListener("change", () => {
        const file = importFileInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = JSON.parse(event.target.result);
                const { imported, skipped } = importProfileFromExport({ parsed, profileStore });
                render();
                alert(`Imported ${imported} measurement${imported !== 1 ? "s" : ""}.${skipped ? ` Skipped ${skipped} (duplicates or missing data).` : ""}`);
            } catch (err) {
                alert(`Import failed: ${err.message}`);
            }
        };
        reader.readAsText(file);
    });

    resetForm();
    return { render };
}