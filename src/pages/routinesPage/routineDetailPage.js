// pages/routineDetailPage.js

import { navigate } from "../../router.js";
import { t } from "/src/internationalization/i18n.js";
import { SetSeries } from "../../models/setSeries.js";
import { createSeriesListView } from "./routineDetail/seriesListView.js";
import { createSeriesEditorView } from "./routineDetail/seriesEditorView.js";
import { escapeHtml, escapeHtmlAttr, flashInvalid } from "./routineDetail/viewUtils.js";
import { buildRoutineExportV1, downloadJson, routineExportFilename } from "../../export/routineExport.js";

export function mountRoutineDetailPage({ routineStore, exerciseStore }) {

    const routineTitle = document.getElementById("routineTitle");
    const routineDesc = document.getElementById("routineDesc");
    const btnDeleteRoutine = document.getElementById("btnDeleteRoutine");
    const btnEditRoutine = document.getElementById("btnEditRoutine");
    const routineMetaEditor = document.getElementById("routineMetaEditor");
    const editRoutineName = document.getElementById("editRoutineName");
    const editRoutineDescription = document.getElementById("editRoutineDescription");
    const btnSaveRoutineMeta = document.getElementById("btnSaveRoutineMeta");
    const btnCancelRoutineMeta = document.getElementById("btnCancelRoutineMeta");

    const btnStartSession = document.getElementById("btnStartSession");
    const btnDownloadRoutine = document.querySelector('#route-routine .pageHeader button[data-action="download"]');

    const exerciseInput = document.getElementById("exerciseInput");
    const exerciseOptions = document.getElementById("exerciseOptions");
    const seriesDescription = document.getElementById("seriesDescription");
    const btnAddSeries = document.getElementById("btnAddSeries");

    const seriesListEl = document.getElementById("seriesList");
    const seriesEmptyEl = document.getElementById("seriesEmpty");

    let currentId = null;
    let editingMeta = false;

    function setMetaEditorOpen(open, routine) {
        editingMeta = !!open;

        if (routineMetaEditor) routineMetaEditor.style.display = open ? "" : "none";
        if (btnEditRoutine) btnEditRoutine.disabled = open; // prevent double-open

        if (open && routine) {
            editRoutineName.value = routine.name ?? "";
            editRoutineDescription.value = routine.description ?? "";
            editRoutineName.focus();
            editRoutineName.select?.();
        }
    }

    function getCurrentRoutineId() {
        return currentId;
    }

    function renderExerciseOptions() {
        const exercises = exerciseStore
            .list()
            .slice()
            .sort((a, b) => String(a.description).localeCompare(String(b.description)));

        exerciseOptions.innerHTML = exercises
            .map((ex) => `<option value="${escapeHtmlAttr(ex.description)}"></option>`)
            .join("");
    }

    const seriesEditorView = createSeriesEditorView({
        routineStore,
        exerciseStore,
        getCurrentRoutineId,
        onRoutineChanged: (routine) => {
            seriesListView.renderSeries(routine);
        },
    });

    const seriesListView = createSeriesListView({
        seriesListEl,
        seriesEmptyEl,
        routineStore,
        exerciseStore,
        getCurrentRoutineId,
        onEditSeries: (idx) => {
            seriesEditorView.open(idx);
        },
        onSeriesRemoved: (removedIdx) => {
            seriesEditorView.adjustIndexAfterSeriesRemoved(removedIdx);
            renderExerciseOptions();
        },
    });

    btnDownloadRoutine?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!currentId) {
            return;
        }

        const routine = routineStore.getById(currentId);
        if (!routine) {
            return;
        }

        const payload = buildRoutineExportV1({ routine, exerciseStore });
        downloadJson({ filename: routineExportFilename(routine), data: payload });
    });

    btnEditRoutine?.addEventListener("click", () => {
        if (!currentId) return;

        const routine = routineStore.getById(currentId);
        if (!routine) return;

        setMetaEditorOpen(true, routine);
    });

    btnCancelRoutineMeta?.addEventListener("click", () => {
        const routine = currentId ? routineStore.getById(currentId) : null;
        setMetaEditorOpen(false, routine);
    });

    btnSaveRoutineMeta?.addEventListener("click", () => {
        if (!currentId) return;

        const routine = routineStore.getById(currentId);
        if (!routine) return;

        const name = String(editRoutineName.value ?? "").trim();
        const desc = String(editRoutineDescription.value ?? "").trim();

        if (!name) {
            flashInvalid(editRoutineName);
            return;
        }

        routine.name = name;
        routine.description = desc;

        routineStore.update(routine);

        routineTitle.textContent = routine.name || t("routines.untitled");
        routineDesc.textContent = routine.description || t("common.dash");

        setMetaEditorOpen(false, routine);
    });

    btnDeleteRoutine.addEventListener("click", () => {
        if (!currentId) {
            return;
        }

        const routine = routineStore.getById(currentId);
        const nameOrId = routine?.name?.trim() ? routine.name.trim() : currentId;

        const ok = confirm(t("routine.confirmDelete", { name: escapeHtml(nameOrId) }));
        if (!ok) {
            return;
        }

        routineStore.remove(currentId);
        navigate("#/routines");
    });

    btnAddSeries.addEventListener("click", () => {
        const routine = routineStore.getById(currentId);
        if (!routine) {
            return;
        }

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
        seriesListView.renderSeries(routine);
    });

    btnStartSession?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!currentId) {
            return;
        }

        navigate(`#/session/${currentId}`);
    });

    function render(params) {
        currentId = params?.id ?? null;

        const routine = currentId ? routineStore.getById(currentId) : null;
        if (!routine) {
            navigate("#/routines");
            return;
        }

        routineTitle.textContent = routine.name || t("routines.untitled");
        routineDesc.textContent = routine.description || t("common.dash");
        setMetaEditorOpen(false, routine);

        renderExerciseOptions();
        seriesListView.renderSeries(routine);
        seriesEditorView.close();
    }

    return { render };
}