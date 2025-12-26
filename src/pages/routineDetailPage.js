import { navigate } from "../router.js";
import { SetSeries } from "../models/setSeries.js";
import { RepGroup, Laterality } from "../models/repGroup.js";

export function mountRoutineDetailPage({ routineStore, exerciseStore }) {
    const routineTitle = document.getElementById("routineTitle");
    const routineDesc = document.getElementById("routineDesc");
    const btnDeleteRoutine = document.getElementById("btnDeleteRoutine");

    const exerciseInput = document.getElementById("exerciseInput");
    const exerciseOptions = document.getElementById("exerciseOptions");
    const seriesDescription = document.getElementById("seriesDescription");
    const btnAddSeries = document.getElementById("btnAddSeries");

    const seriesList = document.getElementById("seriesList");
    const seriesEmpty = document.getElementById("seriesEmpty");

    const seriesEditor = document.getElementById("seriesEditor");
    const seriesEditorTitle = document.getElementById("seriesEditorTitle");
    const btnCloseSeriesEditor = document.getElementById("btnCloseSeriesEditor");

    const editSeriesDescription = document.getElementById("editSeriesDescription");
    const editSeriesRest = document.getElementById("editSeriesRest");
    const btnSaveSeries = document.getElementById("btnSaveSeries");

    const repGroupList = document.getElementById("repGroupList");
    const repGroupEmpty = document.getElementById("repGroupEmpty");

    const rgLaterality = document.getElementById("rgLaterality");
    const rgTargetReps = document.getElementById("rgTargetReps");
    const rgWeightSingleWrap = document.getElementById("rgWeightSingleWrap");
    const rgWeightTupleWrap = document.getElementById("rgWeightTupleWrap");
    const rgWeightSingle = document.getElementById("rgWeightSingle");
    const rgWeightLeft = document.getElementById("rgWeightLeft");
    const rgWeightRight = document.getElementById("rgWeightRight");
    const rgRestAfter = document.getElementById("rgRestAfter");
    const btnAddRepGroup = document.getElementById("btnAddRepGroup");

    let currentId = null;
    let editingSeriesIndex = null;

    btnDeleteRoutine.addEventListener("click", () => {
        if (!currentId) return;
        const routine = routineStore.getById(currentId);
        const ok = confirm(`Delete routine "${routine?.name ?? currentId}"?`);
        if (!ok) return;
        routineStore.remove(currentId);
        navigate("#/routines");
    });

    function renderExerciseOptions() {
        const exercises = exerciseStore
            .list()
            .slice()
            .sort((a, b) => String(a.description).localeCompare(String(b.description)));

        exerciseOptions.innerHTML = exercises
            .map((ex) => `<option value="${escapeHtmlAttr(ex.description)}"></option>`)
            .join("");
    }

    function renderSeries(routine) {
        const items = Array.isArray(routine.series) ? routine.series : [];
        seriesList.innerHTML = "";

        if (items.length === 0) {
            seriesEmpty.style.display = "block";
            return;
        }
        seriesEmpty.style.display = "none";

        const exById = new Map(exerciseStore.list().map((ex) => [ex.id, ex]));

        for (let i = 0; i < items.length; i++) {
            const s = items[i];
            const ex = exById.get(s.exerciseId);
            const exName = ex?.description ?? "(missing exercise)";
            const desc = s.description || "—";
            const rest = Number(s.restSecondsAfter ?? 0);

            const row = document.createElement("div");
            row.className = "routineRow";
            row.setAttribute("data-index", String(i));
            row.setAttribute("draggable", "true");
            row.style.cursor = "grab";

            row.innerHTML = `
                <div class="routineMeta">
                    <h3>${escapeHtml(exName)}</h3>
                    <p>${escapeHtml(desc)} · Rest after: ${rest}s</p>
                </div>
                <div class="rowActions">
                    <span class="chip">#${i + 1}</span>
                    <button class="btn" data-action="edit-series" data-index="${i}">Edit</button>
                    <button class="btn" data-action="move-up" data-index="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
                    <button class="btn" data-action="move-down" data-index="${i}" ${i === items.length - 1 ? "disabled" : ""}>↓</button>
                    <button class="btn danger" data-action="remove-series" data-index="${i}">Remove</button>
                </div>
            `;
            seriesList.appendChild(row);
        }
    }

    function moveItem(arr, from, to) {
        if (from === to) return;
        const item = arr.splice(from, 1)[0];
        arr.splice(to, 0, item);
    }

    function flashMoved(el, className) {
        if (!el) return;
        el.classList.remove(className);
        void el.offsetWidth;
        el.classList.add(className);
        setTimeout(() => el.classList.remove(className), 350);
    }

    function reorderAndSave(fromIdx, toIdx) {
        const routine = routineStore.getById(currentId);
        if (!routine) return;

        const n = routine.series.length;
        if (
            !Number.isInteger(fromIdx) || !Number.isInteger(toIdx) ||
            fromIdx < 0 || toIdx < 0 || fromIdx >= n || toIdx >= n
        ) return;

        moveItem(routine.series, fromIdx, toIdx);
        routineStore.update(routine);
        renderSeries(routine);

        requestAnimationFrame(() => {
            const movedRow = seriesList.querySelector(`.routineRow[data-index="${toIdx}"]`);
            const otherRow = seriesList.querySelector(`.routineRow[data-index="${fromIdx}"]`);
            flashMoved(movedRow, "moved");
            flashMoved(otherRow, "movedOther");
        });
    }

    // Drag & drop reorder
    let dragFromIndex = null;

    seriesList.addEventListener("dragstart", (e) => {
        const row = e.target.closest(".routineRow[data-index]");
        if (!row) return;

        dragFromIndex = Number(row.getAttribute("data-index"));
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(dragFromIndex));
        row.style.opacity = "0.7";
    });

    seriesList.addEventListener("dragend", (e) => {
        const row = e.target.closest(".routineRow[data-index]");
        if (row) row.style.opacity = "";
        dragFromIndex = null;
    });

    seriesList.addEventListener("dragover", (e) => {
        const row = e.target.closest(".routineRow[data-index]");
        if (!row) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    });

    seriesList.addEventListener("drop", (e) => {
        const targetRow = e.target.closest(".routineRow[data-index]");
        if (!targetRow) return;
        e.preventDefault();

        const toIdx = Number(targetRow.getAttribute("data-index"));
        let fromIdx = dragFromIndex;
        if (!Number.isInteger(fromIdx)) {
            fromIdx = Number(e.dataTransfer.getData("text/plain"));
        }
        if (!Number.isInteger(fromIdx) || !Number.isInteger(toIdx)) return;

        reorderAndSave(fromIdx, toIdx);
    });

    // Series list actions: edit / remove / arrows
    seriesList.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;

        const action = btn.getAttribute("data-action");
        const idx = Number(btn.getAttribute("data-index"));

        if (action === "edit-series") {
            openSeriesEditor(idx);
            return;
        }

        if (action === "remove-series") {
            const routine = routineStore.getById(currentId);
            if (!routine) return;

            const ok = confirm(`Remove series #${idx + 1}?`);
            if (!ok) return;

            routine.series.splice(idx, 1);
            routineStore.update(routine);
            renderExerciseOptions();
            renderSeries(routine);

            if (editingSeriesIndex === idx) {
                closeSeriesEditor();
            } else if (editingSeriesIndex !== null && idx < editingSeriesIndex) {
                editingSeriesIndex -= 1;
            }

            return;
        }

        if (action === "move-up") {
            reorderAndSave(idx, idx - 1);
            return;
        }

        if (action === "move-down") {
            reorderAndSave(idx, idx + 1);
            return;
        }
    });

    // Add series
    btnAddSeries.addEventListener("click", () => {
        const routine = routineStore.getById(currentId);
        if (!routine) return;

        const typed = String(exerciseInput.value ?? "").trim();
        if (!typed) {
            flashInvalid(exerciseInput);
            return;
        }

        const exercise = exerciseStore.getOrCreateByDescription(typed);

        const ss = new SetSeries({
            exerciseId: exercise.id,
            description: String(seriesDescription.value ?? "").trim(),
            repGroups: [],
            restSecondsAfter: 0,
        });

        routine.series.push(ss);
        routineStore.update(routine);

        exerciseInput.value = "";
        seriesDescription.value = "";
        exerciseInput.focus();

        renderExerciseOptions();
        renderSeries(routine);
    });

    // Editor open/close
    btnCloseSeriesEditor.addEventListener("click", () => {
        closeSeriesEditor();
    });

    function openSeriesEditor(seriesIndex) {
        const routine = routineStore.getById(currentId);
        if (!routine) return;

        if (!routine.series[seriesIndex]) return;

        editingSeriesIndex = seriesIndex;

        const s = routine.series[seriesIndex];
        const ex = exerciseStore.getById(s.exerciseId);
        const exName = ex?.description ?? "(missing exercise)";

        seriesEditorTitle.textContent = `Edit series #${seriesIndex + 1} · ${exName}`;
        editSeriesDescription.value = s.description ?? "";
        editSeriesRest.value = String(Number(s.restSecondsAfter ?? 0));

        seriesEditor.style.display = "";
        renderRepGroups(s);
        syncLateralityUI();
    }

    function closeSeriesEditor() {
        editingSeriesIndex = null;
        seriesEditor.style.display = "none";
        repGroupList.innerHTML = "";
        repGroupEmpty.style.display = "none";
    }

    // Save series fields
    btnSaveSeries.addEventListener("click", () => {
        if (editingSeriesIndex === null) return;

        const routine = routineStore.getById(currentId);
        if (!routine) return;

        const s = routine.series[editingSeriesIndex];
        if (!s) return;

        s.description = String(editSeriesDescription.value ?? "").trim();

        const rest = toNonNegativeNumber(editSeriesRest.value, 0);
        s.restSecondsAfter = rest;

        routineStore.update(routine);
        renderSeries(routine);

        flashOk(btnSaveSeries);
    });

    // Laterality toggles weight inputs
    rgLaterality.addEventListener("change", () => {
        syncLateralityUI();
    });

    function syncLateralityUI() {
        const lat = String(rgLaterality.value);

        if (lat === Laterality.UNILATERAL) {
            rgWeightSingleWrap.style.display = "none";
            rgWeightTupleWrap.style.display = "";
        } else {
            rgWeightSingleWrap.style.display = "";
            rgWeightTupleWrap.style.display = "none";
        }
    }

    // Add RepGroup
    btnAddRepGroup.addEventListener("click", () => {
        if (editingSeriesIndex === null) return;

        const routine = routineStore.getById(currentId);
        if (!routine) return;

        const s = routine.series[editingSeriesIndex];
        if (!s) return;

        const laterality = String(rgLaterality.value);
        const targetReps = toPositiveInt(rgTargetReps.value);
        if (!targetReps) {
            flashInvalid(rgTargetReps);
            return;
        }

        let targetWeight = null;

        if (laterality === Laterality.UNILATERAL) {
            const wl = toNullableNumber(rgWeightLeft.value);
            const wr = toNullableNumber(rgWeightRight.value);
            if (wl === null || wr === null) {
                flashInvalid(wl === null ? rgWeightLeft : rgWeightRight);
                return;
            }
            targetWeight = { left: wl, right: wr };
        } else {
            const w = toNullableNumber(rgWeightSingle.value);
            if (w === null) {
                flashInvalid(rgWeightSingle);
                return;
            }
            targetWeight = w;
        }

        const restSecondsAfter = toNonNegativeNumber(rgRestAfter.value, 0);

        const rg = new RepGroup({
            exerciseId: s.exerciseId,
            laterality,
            targetReps,
            targetWeight,
            restSecondsAfter,
            history: [],
        });

        s.repGroups.push(rg);
        routineStore.update(routine);

        rgTargetReps.value = "";
        rgWeightSingle.value = "";
        rgWeightLeft.value = "";
        rgWeightRight.value = "";
        rgRestAfter.value = "";

        renderRepGroups(s);
        flashOk(btnAddRepGroup);
    });

    // Remove RepGroup
    repGroupList.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action='remove-repGroup']");
        if (!btn) return;

        const idx = Number(btn.getAttribute("data-index"));
        if (!Number.isInteger(idx)) return;

        if (editingSeriesIndex === null) return;
        const routine = routineStore.getById(currentId);
        if (!routine) return;

        const s = routine.series[editingSeriesIndex];
        if (!s) return;

        const ok = confirm(`Remove rep group #${idx + 1}?`);
        if (!ok) return;

        s.repGroups.splice(idx, 1);
        routineStore.update(routine);
        renderRepGroups(s);
    });

    function renderRepGroups(setSeries) {
        const items = Array.isArray(setSeries.repGroups) ? setSeries.repGroups : [];
        repGroupList.innerHTML = "";

        if (items.length === 0) {
            repGroupEmpty.style.display = "block";
            return;
        }
        repGroupEmpty.style.display = "none";

        for (let i = 0; i < items.length; i++) {
            const g = items[i];

            const reps = g.targetReps ?? "—";
            const rest = Number(g.restSecondsAfter ?? 0);

            let weightText = "—";
            if (typeof g.targetWeight === "number") {
                weightText = `${g.targetWeight}`;
            } else if (g.targetWeight && typeof g.targetWeight === "object") {
                weightText = `${g.targetWeight.left} / ${g.targetWeight.right}`;
            }

            const row = document.createElement("div");
            row.className = "routineRow";
            row.innerHTML = `
                <div class="routineMeta">
                    <h3>Rep group #${i + 1}</h3>
                    <p>
                        ${escapeHtml(g.laterality)} · reps: ${escapeHtml(reps)} · weight: ${escapeHtml(weightText)} · rest: ${rest}s
                    </p>
                </div>
                <div class="rowActions">
                    <button class="btn danger" data-action="remove-repGroup" data-index="${i}">Remove</button>
                </div>
            `;
            repGroupList.appendChild(row);
        }
    }

    function render(params) {
        currentId = params?.id ?? null;

        const routine = currentId ? routineStore.getById(currentId) : null;
        if (!routine) {
            navigate("#/routines");
            return;
        }

        routineTitle.textContent = routine.name || "Routine";
        routineDesc.textContent = routine.description || "—";

        renderExerciseOptions();
        renderSeries(routine);

        closeSeriesEditor();
    }

    return { render };
}

function escapeHtml(s) {
    return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escapeHtmlAttr(s) {
    return escapeHtml(s).replaceAll("\n", " ");
}

function flashInvalid(inputEl) {
    inputEl.focus();
    const prev = inputEl.style.borderColor;
    inputEl.style.borderColor = "rgba(248,113,113,0.7)";
    setTimeout(() => (inputEl.style.borderColor = prev), 700);
}

function flashOk(btn) {
    const prev = btn.style.borderColor;
    btn.style.borderColor = "rgba(96,165,250,0.75)";
    setTimeout(() => (btn.style.borderColor = prev), 350);
}

function toNonNegativeNumber(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return n;
}

function toPositiveInt(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n);
}

function toNullableNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return n;
}