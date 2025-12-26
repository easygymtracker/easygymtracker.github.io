import { navigate } from "../router.js";
import { SetSeries } from "../models/setSeries.js";

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

    let currentId = null;

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

            const row = document.createElement("div");
            row.className = "routineRow";
            row.setAttribute("data-index", String(i));
            row.setAttribute("draggable", "true");
            row.style.cursor = "grab";

            row.innerHTML = `
      <div class="routineMeta">
        <h3>${escapeHtml(exName)}</h3>
        <p>${escapeHtml(desc)}</p>
      </div>
      <div class="rowActions">
        <span class="chip">#${i + 1}</span>
        <button class="btn" data-action="move-up" data-index="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="btn" data-action="move-down" data-index="${i}" ${i === items.length - 1 ? "disabled" : ""}>↓</button>
        <button class="btn danger" data-action="remove-series" data-index="${i}">Remove</button>
      </div>
    `;
            seriesList.appendChild(row);
        }
    }

    /** Move item in array in-place */
    function moveItem(arr, from, to) {
        if (from === to) return;
        const item = arr.splice(from, 1)[0];
        arr.splice(to, 0, item);
    }

    /** Persist + rerender after reorder */
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

        // Animate both: the moved row (now at toIdx) and the displaced row (now at fromIdx)
        requestAnimationFrame(() => {
            const movedRow = seriesList.querySelector(`.routineRow[data-index="${toIdx}"]`);
            const otherRow = seriesList.querySelector(`.routineRow[data-index="${fromIdx}"]`);

            flashMoved(movedRow, "moved");
            flashMoved(otherRow, "movedOther");
        });
    }

    function flashMoved(el, className) {
        if (!el) return;
        el.classList.remove(className); // reset if user clicks fast
        void el.offsetWidth;            // force reflow to restart animation
        el.classList.add(className);
        setTimeout(() => el.classList.remove(className), 350);
    }

    // Remove a series (by index)
    seriesList.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;

        const action = btn.getAttribute("data-action");
        const idx = Number(btn.getAttribute("data-index"));

        if (action === "remove-series") {
            const routine = routineStore.getById(currentId);
            if (!routine) return;

            const ok = confirm(`Remove series #${idx + 1}?`);
            if (!ok) return;

            routine.series.splice(idx, 1);
            routineStore.update(routine);
            renderExerciseOptions();
            renderSeries(routine);
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

    let dragFromIndex = null;

    seriesList.addEventListener("dragstart", (e) => {
        const row = e.target.closest(".routineRow[data-index]");
        if (!row) return;

        dragFromIndex = Number(row.getAttribute("data-index"));
        e.dataTransfer.effectAllowed = "move";
        // Required for some browsers; content doesn't matter
        e.dataTransfer.setData("text/plain", String(dragFromIndex));

        row.style.opacity = "0.7";
    });

    seriesList.addEventListener("dragend", (e) => {
        const row = e.target.closest(".routineRow[data-index]");
        if (row) row.style.opacity = "";
        dragFromIndex = null;
    });

    seriesList.addEventListener("dragover", (e) => {
        // Allow drop
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

        // Prefer stored variable; fallback to dataTransfer
        let fromIdx = dragFromIndex;
        if (!Number.isInteger(fromIdx)) {
            fromIdx = Number(e.dataTransfer.getData("text/plain"));
        }

        if (!Number.isInteger(fromIdx) || !Number.isInteger(toIdx)) return;

        reorderAndSave(fromIdx, toIdx);
    });

    btnAddSeries.addEventListener("click", () => {
        const routine = routineStore.getById(currentId);
        if (!routine) return;

        const typed = String(exerciseInput.value ?? "").trim();
        if (!typed) {
            flashInvalid(exerciseInput);
            return;
        }

        // Find existing exercise by name, or create new
        const exercise = exerciseStore.getOrCreateByDescription(typed);

        // Create SetSeries with associated exercise
        const ss = new SetSeries({
            exerciseId: exercise.id,
            description: String(seriesDescription.value ?? "").trim(),
            repGroups: [],
            restSecondsAfter: 0,
        });

        routine.series.push(ss);
        routineStore.update(routine);

        // Reset inputs
        exerciseInput.value = "";
        seriesDescription.value = "";
        exerciseInput.focus();

        // Refresh UI
        renderExerciseOptions();
        renderSeries(routine);
    });

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
    }

    return { render };
}

// --- tiny helpers (kept local to avoid extra files) ---
function escapeHtml(s) {
    return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escapeHtmlAttr(s) {
    // for option value=""
    return escapeHtml(s).replaceAll("\n", " ");
}

function flashInvalid(inputEl) {
    inputEl.focus();
    const prev = inputEl.style.borderColor;
    inputEl.style.borderColor = "rgba(248,113,113,0.7)";
    setTimeout(() => (inputEl.style.borderColor = prev), 700);
}