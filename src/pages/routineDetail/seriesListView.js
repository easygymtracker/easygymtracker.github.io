// pages/routineDetail/seriesListView.js

import { t } from "../../internationalization/i18n.js";
import { escapeHtml } from "./viewUtils.js";

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

function restAfterLabel(seconds) {
    return t("routine.seriesList.restAfter", { seconds });
}

function removeSeriesConfirmLabel(index1Based) {
    return t("routine.seriesList.confirmRemoveSeries", { index: index1Based });
}

function repGroupCountLabel(count) {
    if (count === 1) {
        return t("routines.seriesCount.one", { count });
    }
    return t("routines.seriesCount.other", { count });
}

export function createSeriesListView({
    seriesListEl,
    seriesEmptyEl,
    routineStore,
    exerciseStore,
    getCurrentRoutineId,
    onEditSeries,
    onSeriesRemoved,
}) {
    let dragFromIndex = null;

    function renderSeries(routine) {
        const items = Array.isArray(routine.series) ? routine.series : [];
        seriesListEl.innerHTML = "";

        if (items.length === 0) {
            seriesEmptyEl.style.display = "block";
            return;
        }
        seriesEmptyEl.style.display = "none";

        const exById = new Map(exerciseStore.list().map((ex) => [ex.id, ex]));

        for (let i = 0; i < items.length; i++) {
            const s = items[i];
            const ex = exById.get(s.exerciseId);
            const exName = ex?.description ?? t("routine.seriesList.missingExercise");
            const desc = s.description || t("common.dash");
            const rest = Number(s.restSecondsAfter ?? 0);

            const repGroupCount = Array.isArray(s.repGroups) ? s.repGroups.length : 0;

            const row = document.createElement("div");
            row.className = "routineRow";
            row.setAttribute("data-index", String(i));
            row.setAttribute("draggable", "true");
            row.style.cursor = "grab";

            row.innerHTML = `
                <div class="routineMeta">
                    <h3>${escapeHtml(`#${i + 1} ${exName}`)}</h3>
                    <p>${escapeHtml(desc)} · ${escapeHtml(restAfterLabel(rest))}</p>
                </div>
                <div class="rowActions">
                    <span class="chip">${escapeHtml(repGroupCountLabel(repGroupCount))}</span>
                    <button class="btn" data-action="edit-series" data-index="${i}">
                        ${escapeHtml(t("common.edit"))}
                    </button>
                    <button class="btn" data-action="move-up" data-index="${i}" ${i === 0 ? "disabled" : ""}>
                        ↑
                    </button>
                    <button class="btn" data-action="move-down" data-index="${i}" ${i === items.length - 1 ? "disabled" : ""}>
                        ↓
                    </button>
                    <button class="btn danger" data-action="remove-series" data-index="${i}">
                        ${escapeHtml(t("common.remove"))}
                    </button>
                </div>
            `;
            seriesListEl.appendChild(row);
        }
    }

    function reorderAndSave(fromIdx, toIdx) {
        const routineId = getCurrentRoutineId();
        const routine = routineStore.getById(routineId);
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
            const movedRow = seriesListEl.querySelector(`.routineRow[data-index="${toIdx}"]`);
            const otherRow = seriesListEl.querySelector(`.routineRow[data-index="${fromIdx}"]`);
            flashMoved(movedRow, "moved");
            flashMoved(otherRow, "movedOther");
        });
    }

    seriesListEl.addEventListener("click", (e) => {
        const row = e.target.closest(".routineRow[data-index]");
        if (!row) return;

        const btn = e.target.closest("button[data-action]");
        const idx = Number(row.getAttribute("data-index"));
        const action = btn ? btn.getAttribute("data-action") : "edit-series";

        if (action === "edit-series") {
            onEditSeries(idx);
            return;
        }

        if (action === "remove-series") {
            const routineId = getCurrentRoutineId();
            const routine = routineStore.getById(routineId);
            if (!routine) return;

            const ok = confirm(removeSeriesConfirmLabel(idx + 1));
            if (!ok) return;

            routine.series.splice(idx, 1);
            routineStore.update(routine);
            renderSeries(routine);

            if (onSeriesRemoved) onSeriesRemoved(idx);
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

    seriesListEl.addEventListener("dragstart", (e) => {
        const row = e.target.closest(".routineRow[data-index]");
        if (!row) return;

        dragFromIndex = Number(row.getAttribute("data-index"));
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(dragFromIndex));
        row.style.opacity = "0.7";
    });

    seriesListEl.addEventListener("dragend", (e) => {
        const row = e.target.closest(".routineRow[data-index]");
        if (row) row.style.opacity = "";
        dragFromIndex = null;
    });

    seriesListEl.addEventListener("dragover", (e) => {
        const row = e.target.closest(".routineRow[data-index]");
        if (!row) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    });

    seriesListEl.addEventListener("drop", (e) => {
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

    return {
        renderSeries,
    };
}