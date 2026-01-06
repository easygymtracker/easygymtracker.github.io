// pages/routineDetailPage.js

import { navigate } from "../router.js";
import { t } from "../internationalization/i18n.js";
import { SetSeries } from "../models/setSeries.js";
import { createSeriesListView } from "./routineDetail/seriesListView.js";
import { createSeriesEditorView } from "./routineDetail/seriesEditorView.js";
import { escapeHtml, escapeHtmlAttr, flashInvalid } from "./routineDetail/viewUtils.js";

export function mountRoutineDetailPage({ routineStore, exerciseStore }) {
    const routineTitle = document.getElementById("routineTitle");
    const routineDesc = document.getElementById("routineDesc");
    const btnDeleteRoutine = document.getElementById("btnDeleteRoutine");

    const exerciseInput = document.getElementById("exerciseInput");
    const exerciseOptions = document.getElementById("exerciseOptions");
    const seriesDescription = document.getElementById("seriesDescription");
    const btnAddSeries = document.getElementById("btnAddSeries");

    const seriesListEl = document.getElementById("seriesList");
    const seriesEmptyEl = document.getElementById("seriesEmpty");

    let currentId = null;

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

    function render(params) {
        currentId = params?.id ?? null;

        const routine = currentId ? routineStore.getById(currentId) : null;
        if (!routine) {
            navigate("#/routines");
            return;
        }

        routineTitle.textContent = routine.name || t("routines.untitled");
        routineDesc.textContent = routine.description || t("common.dash");

        renderExerciseOptions();
        seriesListView.renderSeries(routine);
        seriesEditorView.close();
    }

    return { render };
}