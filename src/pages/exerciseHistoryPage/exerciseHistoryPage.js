// src/pages/exerciseHistoryPage/exerciseHistoryPage.js

import { t } from "/src/internationalization/i18n.js";
import { escapeHtml } from "/src/ui/dom.js";
import { navigate } from "/src/router.js";

// ─── date helpers ─────────────────────────────────────────────────────────────

function toInputDateTimeLocal(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return "";
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function toIsoFromLocal(localStr) {
    if (!localStr) return null;
    return new Date(localStr).toISOString();
}

function formatDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
    }).format(d);
}

// ─── value helpers ────────────────────────────────────────────────────────────

function isLR(v) {
    return v !== null && typeof v === "object" && ("left" in v || "right" in v);
}

function formatReps(reps) {
    if (reps == null) return "—";
    if (isLR(reps)) return `L:${reps.left ?? "—"} / R:${reps.right ?? "—"}`;
    return String(reps);
}

function formatWeight(weight) {
    if (weight == null) return "—";
    if (isLR(weight)) return `L:${weight.left ?? "—"} / R:${weight.right ?? "—"} kg`;
    return `${weight} kg`;
}

function parseOptional(val) {
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
}

function toScalarWeight(w) {
    if (w == null) return 0;
    if (typeof w === "number") return w;
    return ((w.left ?? 0) + (w.right ?? 0)) / 2;
}

function toScalarReps(r) {
    if (r == null) return 0;
    if (typeof r === "number") return r;
    return (r.left ?? 0) + (r.right ?? 0);
}

function toVolume(entry) {
    const r = toScalarReps(entry.reps);
    const w = toScalarWeight(entry.weight);
    return r * w;
}

// ─── gather all entries for an exercise ───────────────────────────────────────

function gatherEntries(exerciseId, routineStore) {
    const entries = [];
    for (const routine of routineStore.list()) {
        for (const series of routine.series ?? []) {
            if (series.exerciseId !== exerciseId) continue;
            for (let rgIdx = 0; rgIdx < (series.repGroups ?? []).length; rgIdx++) {
                const rg = series.repGroups[rgIdx];
                for (let eIdx = 0; eIdx < (rg.history ?? []).length; eIdx++) {
                    const entry = rg.history[eIdx];
                    entries.push({
                        routineId: routine.id,
                        routineName: routine.name,
                        seriesId: series.id,
                        seriesDesc: series.description || null,
                        repGroupId: rg.id,
                        repGroupIndex: rgIdx,
                        laterality: rg.laterality,
                        entryIndex: eIdx,
                        dateTime: entry.dateTime,
                        reps: entry.reps,
                        weight: entry.weight,
                    });
                }
            }
        }
    }
    // newest first
    entries.sort((a, b) => (b.dateTime ?? "").localeCompare(a.dateTime ?? ""));
    return entries;
}

// ─── gather repGroup options for add form ─────────────────────────────────────

function gatherRepGroupOptions(exerciseId, routineStore) {
    const options = [];
    for (const routine of routineStore.list()) {
        for (const series of routine.series ?? []) {
            if (series.exerciseId !== exerciseId) continue;
            for (let rgIdx = 0; rgIdx < (series.repGroups ?? []).length; rgIdx++) {
                const rg = series.repGroups[rgIdx];
                const label = [
                    routine.name,
                    series.description ? `· ${series.description}` : null,
                    `· ${t("exerciseHistory.setN") || "Set"} ${rgIdx + 1}`,
                    `(${rg.laterality})`,
                ].filter(Boolean).join(" ");
                options.push({
                    routineId: routine.id,
                    seriesId: series.id,
                    repGroupId: rg.id,
                    laterality: rg.laterality,
                    label,
                });
            }
        }
    }
    return options;
}

// ─── stats ────────────────────────────────────────────────────────────────────

function computeStats(entries) {
    if (!entries.length) return null;

    let totalVolume = 0;
    let bestWeight = 0;
    const sessions = new Set();

    for (const e of entries) {
        totalVolume += toVolume(e);
        const w = toScalarWeight(e.weight);
        if (w > bestWeight) bestWeight = w;
        if (e.dateTime) sessions.add(e.dateTime.slice(0, 10));
    }

    const last = entries[0]?.dateTime;

    return {
        totalSets: entries.length,
        totalSessions: sessions.size,
        totalVolume: Math.round(totalVolume),
        bestWeight,
        lastSession: last ? formatDateTime(last) : "—",
    };
}

// ─── simple SVG sparkline ─────────────────────────────────────────────────────

function sparklineSvg(points, color, yUnit, label) {
    if (!points.length) return `<p class="muted" style="font-size:0.85rem;">${escapeHtml(t("exerciseHistory.noChartData") || "No data yet.")}</p>`;

    const W = 360, H = 110, pL = 36, pR = 8, pT = 10, pB = 20;
    const min = Math.min(...points.map(p => p.v));
    const max = Math.max(...points.map(p => p.v));
    const range = max - min || 1;
    const plotW = W - pL - pR;
    const plotH = H - pT - pB;

    const coords = points.map((p, i) => ({
        ...p,
        x: pL + plotW * (points.length === 1 ? 0.5 : i / (points.length - 1)),
        y: pT + plotH * (1 - (p.v - min) / range),
    }));

    const polyline = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    const dots = coords.map(c => `
        <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="${color}">
            <title>${escapeHtml(c.day)}: ${c.v}${escapeHtml(yUnit)}</title>
        </circle>
    `).join("");

    return `
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(label)}" class="exHistSparkline">
            <line x1="${pL}" y1="${pT}" x2="${pL}" y2="${H - pB}" stroke="var(--border)" stroke-width="1"/>
            <line x1="${pL}" y1="${H - pB}" x2="${W - pR}" y2="${H - pB}" stroke="var(--border)" stroke-width="1"/>
            <text x="${pL - 2}" y="${pT + 4}" fill="var(--muted)" font-size="9" text-anchor="end">${max}${escapeHtml(yUnit)}</text>
            <text x="${pL - 2}" y="${H - pB}" fill="var(--muted)" font-size="9" text-anchor="end">${min}${escapeHtml(yUnit)}</text>
            <polyline fill="none" stroke="${color}" stroke-width="2.5" points="${polyline}"/>
            ${dots}
        </svg>
    `;
}

function buildChartPoints(entries, valueFn) {
    const daily = new Map();
    for (const e of entries) {
        const day = (e.dateTime ?? "").slice(0, 10);
        if (!day) continue;
        const v = valueFn(e);
        if (!daily.has(day) || v > daily.get(day)) daily.set(day, v);
    }
    return Array.from(daily.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, v]) => ({ day, v }));
}

// ─── main page ────────────────────────────────────────────────────────────────

export function mountExerciseHistoryPage({ routineStore, exerciseStore }) {
    const titleEl    = document.getElementById("exerciseHistoryTitle");
    const statsEl    = document.getElementById("exerciseHistoryStats");
    const chartsEl   = document.getElementById("exerciseHistoryCharts");
    const listEl     = document.getElementById("exerciseHistoryList");
    const emptyEl    = document.getElementById("exerciseHistoryEmpty");
    const notFoundEl = document.getElementById("exerciseHistoryNotFound");
    const addSection = document.getElementById("exerciseHistoryAddSection");
    const backBtn    = document.getElementById("btnBackFromExerciseHistory");

    // add form elements
    const addGroupSel      = document.getElementById("exHistAddGroup");
    const addDateIn        = document.getElementById("exHistAddDate");
    const addRepsWrap      = document.getElementById("exHistAddRepsWrap");
    const addRepsIn        = document.getElementById("exHistAddReps");
    const addRepsTupleWrap = document.getElementById("exHistAddRepsTupleWrap");
    const addRepsLeftIn    = document.getElementById("exHistAddRepsLeft");
    const addRepsRightIn   = document.getElementById("exHistAddRepsRight");
    const addWeightWrap    = document.getElementById("exHistAddWeightWrap");
    const addWeightIn      = document.getElementById("exHistAddWeight");
    const addWeightTupleWrap = document.getElementById("exHistAddWeightTupleWrap");
    const addWeightLeftIn  = document.getElementById("exHistAddWeightLeft");
    const addWeightRightIn = document.getElementById("exHistAddWeightRight");
    const btnAddSave       = document.getElementById("btnExHistAddSave");
    const btnAddCancel     = document.getElementById("btnExHistAddCancel");

    let currentExerciseId = null;
    let backRoute = "/routines";
    let addFormOpen = false;
    let repGroupOptions = [];
    let editingEntry = null; // { routineId, seriesId, repGroupId, entryIndex }

    // ── helpers ──────────────────────────────────────────────────────────────

    function show(el) { el?.classList.remove("uHidden"); }
    function hide(el) { el?.classList.add("uHidden"); }

    function rerender() {
        if (currentExerciseId) renderPage(currentExerciseId);
    }

    // ── back button ──────────────────────────────────────────────────────────

    if (backBtn) {
        backBtn.addEventListener("click", () => navigate(backRoute));
    }

    // ── add form: repGroup selector drives laterality ────────────────────────

    function updateAddFormLaterality() {
        const selIdx = addGroupSel?.selectedIndex ?? 0;
        const opt = repGroupOptions[selIdx] ?? null;
        const isUni = opt?.laterality === "unilateral";

        if (isUni) {
            hide(addRepsWrap); show(addRepsTupleWrap);
            hide(addWeightWrap); show(addWeightTupleWrap);
        } else {
            show(addRepsWrap); hide(addRepsTupleWrap);
            show(addWeightWrap); hide(addWeightTupleWrap);
        }
    }

    addGroupSel?.addEventListener("change", updateAddFormLaterality);

    // ── add form: save ───────────────────────────────────────────────────────

    btnAddSave?.addEventListener("click", () => {
        const selIdx = addGroupSel?.selectedIndex ?? 0;
        const opt = repGroupOptions[selIdx] ?? null;
        if (!opt) return;

        const dateTimeIso = toIsoFromLocal(addDateIn?.value);
        if (!dateTimeIso) { addDateIn?.focus(); return; }

        const isUni = opt.laterality === "unilateral";
        let reps, weight;

        if (isUni) {
            reps   = { left: parseOptional(addRepsLeftIn?.value),  right: parseOptional(addRepsRightIn?.value)  };
            weight = { left: parseOptional(addWeightLeftIn?.value), right: parseOptional(addWeightRightIn?.value) };
        } else {
            reps   = parseOptional(addRepsIn?.value);
            weight = parseOptional(addWeightIn?.value);
        }

        const routine = routineStore.getById(opt.routineId);
        if (!routine) return;

        const series = routine.series.find(s => s.id === opt.seriesId);
        if (!series) return;

        const rg = series.repGroups.find(g => g.id === opt.repGroupId);
        if (!rg) return;

        rg.history.push({ dateTime: dateTimeIso, reps, weight });
        routineStore.update(routine);

        // reset form
        if (addDateIn) addDateIn.value = toInputDateTimeLocal(null);
        if (addRepsIn) addRepsIn.value = "";
        if (addRepsLeftIn) addRepsLeftIn.value = "";
        if (addRepsRightIn) addRepsRightIn.value = "";
        if (addWeightIn) addWeightIn.value = "";
        if (addWeightLeftIn) addWeightLeftIn.value = "";
        if (addWeightRightIn) addWeightRightIn.value = "";

        closeAddForm();
        rerender();
    });

    btnAddCancel?.addEventListener("click", closeAddForm);

    function openAddForm() {
        addFormOpen = true;
        repGroupOptions = gatherRepGroupOptions(currentExerciseId, routineStore);

        if (!repGroupOptions.length) return;

        addGroupSel.innerHTML = repGroupOptions
            .map((o, i) => `<option value="${i}">${escapeHtml(o.label)}</option>`)
            .join("");

        if (addDateIn) addDateIn.value = toInputDateTimeLocal(null);
        updateAddFormLaterality();
        show(addSection);
        addDateIn?.focus();
    }

    function closeAddForm() {
        addFormOpen = false;
        hide(addSection);
    }

    // ── edit modal ───────────────────────────────────────────────────────────

    function openEditModal(entryMeta) {
        const { routineId, seriesId, repGroupId, entryIndex, laterality } = entryMeta;
        const routine = routineStore.getById(routineId);
        if (!routine) return;
        const series = routine.series.find(s => s.id === seriesId);
        if (!series) return;
        const rg = series.repGroups.find(g => g.id === repGroupId);
        if (!rg) return;
        const entry = rg.history[entryIndex];
        if (!entry) return;

        editingEntry = entryMeta;
        const isUni = laterality === "unilateral";

        const overlay = document.createElement("div");
        overlay.className = "modalOverlay";

        const modal = document.createElement("div");
        modal.className = "modalCard exHistEditModal";

        const dateVal = toInputDateTimeLocal(entry.dateTime);

        let repsHtml, weightHtml;
        if (isUni) {
            const rL = isLR(entry.reps) ? (entry.reps.left ?? "") : "";
            const rR = isLR(entry.reps) ? (entry.reps.right ?? "") : "";
            const wL = isLR(entry.weight) ? (entry.weight.left ?? "") : "";
            const wR = isLR(entry.weight) ? (entry.weight.right ?? "") : "";
            repsHtml = `
                <div class="field">
                    <label>${escapeHtml(t("exerciseHistory.addEntry.repsTuple") || "Reps (left / right)")}</label>
                    <div class="tupleInputGrid">
                        <input data-field="repsLeft" type="number" min="1" step="1" value="${rL}" />
                        <input data-field="repsRight" type="number" min="1" step="1" value="${rR}" />
                    </div>
                </div>`;
            weightHtml = `
                <div class="field">
                    <label>${escapeHtml(t("exerciseHistory.addEntry.weightTuple") || "Weight (left / right kg)")}</label>
                    <div class="tupleInputGrid">
                        <input data-field="weightLeft" type="number" min="0" step="0.5" value="${wL}" />
                        <input data-field="weightRight" type="number" min="0" step="0.5" value="${wR}" />
                    </div>
                </div>`;
        } else {
            const r = typeof entry.reps === "number" ? entry.reps : "";
            const w = typeof entry.weight === "number" ? entry.weight : "";
            repsHtml = `
                <div class="field">
                    <label>${escapeHtml(t("exerciseHistory.addEntry.reps") || "Reps")}</label>
                    <input data-field="reps" type="number" min="1" step="1" value="${r}" />
                </div>`;
            weightHtml = `
                <div class="field">
                    <label>${escapeHtml(t("exerciseHistory.addEntry.weight") || "Weight (kg)")}</label>
                    <input data-field="weight" type="number" min="0" step="0.5" value="${w}" />
                </div>`;
        }

        modal.innerHTML = `
            <div class="exHistEditHeader">
                <h3>${escapeHtml(t("exerciseHistory.editEntry") || "Edit entry")}</h3>
            </div>
            <div class="form formCompact">
                <div class="field">
                    <label>${escapeHtml(t("exerciseHistory.addEntry.date") || "Date")}</label>
                    <input data-field="dateTime" type="datetime-local" value="${escapeHtml(dateVal)}" required />
                </div>
                ${repsHtml}
                ${weightHtml}
                <div class="actions actionsStart">
                    <button class="btn primary" data-action="save-edit">${escapeHtml(t("common.save") || "Save")}</button>
                    <button class="btn" data-action="cancel-edit">${escapeHtml(t("common.cancel") || "Cancel")}</button>
                </div>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        function closeModal() { overlay.remove(); editingEntry = null; }

        modal.querySelector('[data-action="cancel-edit"]').onclick = closeModal;
        overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
        document.addEventListener("keydown", function onKey(e) {
            if (e.key === "Escape") { document.removeEventListener("keydown", onKey); closeModal(); }
        });

        modal.querySelector('[data-action="save-edit"]').onclick = () => {
            const dateTimeIso = toIsoFromLocal(modal.querySelector('[data-field="dateTime"]')?.value);
            if (!dateTimeIso) return;

            let newReps, newWeight;
            if (isUni) {
                newReps   = { left: parseOptional(modal.querySelector('[data-field="repsLeft"]')?.value),   right: parseOptional(modal.querySelector('[data-field="repsRight"]')?.value) };
                newWeight = { left: parseOptional(modal.querySelector('[data-field="weightLeft"]')?.value), right: parseOptional(modal.querySelector('[data-field="weightRight"]')?.value) };
            } else {
                newReps   = parseOptional(modal.querySelector('[data-field="reps"]')?.value);
                newWeight = parseOptional(modal.querySelector('[data-field="weight"]')?.value);
            }

            // Re-fetch routine (may have been modified elsewhere)
            const r2 = routineStore.getById(routineId);
            if (!r2) return;
            const s2 = r2.series.find(s => s.id === seriesId);
            if (!s2) return;
            const rg2 = s2.repGroups.find(g => g.id === repGroupId);
            if (!rg2) return;

            rg2.history[entryIndex] = { dateTime: dateTimeIso, reps: newReps, weight: newWeight };
            routineStore.update(r2);

            closeModal();
            rerender();
        };
    }

    // ── entry list rendering ─────────────────────────────────────────────────

    function renderEntryList(entries) {
        listEl.innerHTML = "";

        if (!entries.length) {
            show(emptyEl);
            return;
        }
        hide(emptyEl);

        // Group by day for visual separation
        let lastDay = null;

        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const day = (e.dateTime ?? "").slice(0, 10);

            if (day !== lastDay) {
                lastDay = day;
                const dayHeader = document.createElement("div");
                dayHeader.className = "exHistDayHeader";
                dayHeader.textContent = day
                    ? new Intl.DateTimeFormat(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" }).format(new Date(day))
                    : "—";
                listEl.appendChild(dayHeader);
            }

            const source = [
                e.routineName,
                e.seriesDesc ? `· ${e.seriesDesc}` : null,
                `· ${t("exerciseHistory.setN") || "Set"} ${e.repGroupIndex + 1}`,
            ].filter(Boolean).join(" ");

            const card = document.createElement("div");
            card.className = "exHistEntryCard";
            card.innerHTML = `
                <div class="exHistEntryMeta">
                    <span class="exHistEntryTime">${escapeHtml(formatDateTime(e.dateTime).split(",").pop?.() ?? formatDateTime(e.dateTime))}</span>
                    <span class="exHistEntrySource muted">${escapeHtml(source)}</span>
                </div>
                <div class="exHistEntryValues">
                    <span class="chip">${escapeHtml(formatReps(e.reps))} ${escapeHtml(t("session.reps") || "reps")}</span>
                    <span class="chip">${escapeHtml(formatWeight(e.weight))}</span>
                </div>
                <div class="exHistEntryActions">
                    <button class="btn" data-action="edit" data-index="${i}">${escapeHtml(t("common.edit") || "Edit")}</button>
                    <button class="btn danger" data-action="delete" data-index="${i}">${escapeHtml(t("common.remove") || "Delete")}</button>
                </div>
            `;
            listEl.appendChild(card);
        }

        // delegate events
        listEl.onclick = (ev) => {
            const btn = ev.target.closest("button[data-action]");
            if (!btn) return;
            const idx = Number(btn.dataset.index);
            const entry = entries[idx];
            if (!entry) return;

            if (btn.dataset.action === "edit") {
                openEditModal(entry);
            } else if (btn.dataset.action === "delete") {
                const ok = confirm(t("exerciseHistory.confirmDelete") || "Remove this entry?");
                if (!ok) return;

                const routine = routineStore.getById(entry.routineId);
                if (!routine) return;
                const series = routine.series.find(s => s.id === entry.seriesId);
                if (!series) return;
                const rg = series.repGroups.find(g => g.id === entry.repGroupId);
                if (!rg) return;

                rg.history.splice(entry.entryIndex, 1);
                routineStore.update(routine);
                rerender();
            }
        };
    }

    // ── stats rendering ──────────────────────────────────────────────────────

    function renderStats(entries) {
        const stats = computeStats(entries);
        if (!stats) {
            statsEl.innerHTML = "";
            return;
        }

        const fmtVol = stats.totalVolume >= 1000
            ? (stats.totalVolume / 1000).toFixed(1) + " t"
            : stats.totalVolume + " kg";

        statsEl.innerHTML = `
            <div class="summaryKpi">
                <span class="summaryKpiValue">${stats.totalSets}</span>
                <span class="summaryKpiLabel muted">${escapeHtml(t("exerciseHistory.stats.totalSets") || "Total sets")}</span>
            </div>
            <div class="summaryKpi">
                <span class="summaryKpiValue">${stats.totalSessions}</span>
                <span class="summaryKpiLabel muted">${escapeHtml(t("exerciseHistory.stats.sessions") || "Sessions")}</span>
            </div>
            <div class="summaryKpi">
                <span class="summaryKpiValue">${escapeHtml(fmtVol)}</span>
                <span class="summaryKpiLabel muted">${escapeHtml(t("exerciseHistory.stats.totalVolume") || "Total volume")}</span>
            </div>
            <div class="summaryKpi">
                <span class="summaryKpiValue">${stats.bestWeight > 0 ? stats.bestWeight + " kg" : "—"}</span>
                <span class="summaryKpiLabel muted">${escapeHtml(t("exerciseHistory.stats.bestWeight") || "Best weight")}</span>
            </div>
        `;
    }

    // ── charts rendering ─────────────────────────────────────────────────────

    function renderCharts(entries) {
        if (!entries.length) { chartsEl.innerHTML = ""; return; }

        const weightPoints = buildChartPoints(entries, e => toScalarWeight(e.weight));
        const volPoints    = buildChartPoints(entries, e => Math.round(toVolume(e)));

        chartsEl.innerHTML = `
            <div class="exHistChartCard">
                <p class="exHistChartLabel muted">${escapeHtml(t("exerciseHistory.chart.weight") || "Best weight per day")}</p>
                ${sparklineSvg(weightPoints, "var(--accent, #f59e0b)", " kg", t("exerciseHistory.chart.weight") || "Weight")}
            </div>
            <div class="exHistChartCard">
                <p class="exHistChartLabel muted">${escapeHtml(t("exerciseHistory.chart.volume") || "Volume per day")}</p>
                ${sparklineSvg(volPoints, "var(--primary, #6366f1)", " kg", t("exerciseHistory.chart.volume") || "Volume")}
            </div>
        `;
    }

    // ── main render ──────────────────────────────────────────────────────────

    function renderPage(exerciseId) {
        const exercise = exerciseStore.getById(exerciseId);

        if (!exercise) {
            titleEl.textContent = t("exerciseHistory.title") || "Exercise History";
            hide(statsEl); hide(chartsEl); hide(listEl); hide(addSection);
            show(notFoundEl);
            return;
        }

        hide(notFoundEl);
        titleEl.textContent = exercise.description;

        const entries = gatherEntries(exerciseId, routineStore);

        renderStats(entries);
        renderCharts(entries);
        renderEntryList(entries);

        // refresh add form options if open
        if (addFormOpen) openAddForm();
    }

    // ── public render ─────────────────────────────────────────────────────────

    return {
        render(params) {
            currentExerciseId = params?.exerciseId ?? null;
            // parse ?back= from the current URL
            const sp = new URLSearchParams(location.search ?? "");
            backRoute = sp.get("back") || "/routines";

            closeAddForm();
            editingEntry = null;

            if (!currentExerciseId) {
                show(notFoundEl);
                return;
            }

            // ── "Add entry" button (injected once, delegated via list) ──
            // Re-create toolbar each render so it's always fresh
            let toolbar = document.getElementById("exHistToolbar");
            if (!toolbar) {
                toolbar = document.createElement("div");
                toolbar.id = "exHistToolbar";
                toolbar.className = "actions actionsStart";
                toolbar.innerHTML = `<button class="btn primary" id="btnExHistOpenAdd" type="button">${escapeHtml(t("exerciseHistory.addEntry.title") || "Add entry")}</button>`;
                const historyList = document.getElementById("exerciseHistoryList");
                historyList?.parentElement?.insertBefore(toolbar, historyList);

                document.getElementById("btnExHistOpenAdd")?.addEventListener("click", openAddForm);
            } else {
                // Update button label (locale may have changed)
                const addBtn = toolbar.querySelector("#btnExHistOpenAdd");
                if (addBtn) addBtn.textContent = t("exerciseHistory.addEntry.title") || "Add entry";
            }

            renderPage(currentExerciseId);
        },
    };
}
