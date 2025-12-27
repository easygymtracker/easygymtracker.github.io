import { t } from "../../internationalization/i18n.js";
import { RepGroup, Laterality } from "../../models/repGroup.js";
import {
    escapeHtml,
    flashInvalid,
    flashOk,
    toNonNegativeNumber,
    toPositiveInt,
    toNullableNumber,
} from "./viewUtils.js";

function editSeriesTitleLabel(index1Based, exerciseName) {
    return t("seriesEditor.title", { index: index1Based, exercise: exerciseName });
}

function repGroupTitleLabel(index1Based) {
    return t("seriesEditor.repGroup.title", { index: index1Based });
}

function repGroupSummaryLabel({ laterality, reps, weight, restSeconds }) {
    return t("seriesEditor.repGroup.summary", {
        laterality,
        reps,
        weight,
        restSeconds,
    });
}

function removeRepGroupConfirmLabel(index1Based) {
    return t("seriesEditor.repGroup.confirmRemove", { index: index1Based });
}

function missingExerciseLabel() {
    return t("routine.seriesList.missingExercise");
}

export function createSeriesEditorView({
    routineStore,
    exerciseStore,
    getCurrentRoutineId,
    onRoutineChanged,
}) {
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

    let editingSeriesIndex = null;

    btnCloseSeriesEditor.addEventListener("click", () => {
        close();
    });

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

    function open(seriesIndex) {
        const routineId = getCurrentRoutineId();
        const routine = routineStore.getById(routineId);
        if (!routine) return;

        const s = routine.series?.[seriesIndex];
        if (!s) return;

        editingSeriesIndex = seriesIndex;

        const ex = exerciseStore.getById(s.exerciseId);
        const exName = ex?.description ?? missingExerciseLabel();

        seriesEditorTitle.textContent = editSeriesTitleLabel(seriesIndex + 1, exName);
        editSeriesDescription.value = s.description ?? "";
        editSeriesRest.value = String(Number(s.restSecondsAfter ?? 0));

        seriesEditor.style.display = "";
        renderRepGroups(s);
        syncLateralityUI();
    }

    function close() {
        editingSeriesIndex = null;
        seriesEditor.style.display = "none";
        repGroupList.innerHTML = "";
        repGroupEmpty.style.display = "none";
    }

    function isOpenForIndex(idx) {
        return editingSeriesIndex === idx;
    }

    function adjustIndexAfterSeriesRemoved(removedIdx) {
        if (editingSeriesIndex === null) return;

        if (removedIdx === editingSeriesIndex) {
            close();
            return;
        }

        if (removedIdx < editingSeriesIndex) {
            editingSeriesIndex -= 1;
        }
    }

    btnSaveSeries.addEventListener("click", () => {
        if (editingSeriesIndex === null) return;

        const routineId = getCurrentRoutineId();
        const routine = routineStore.getById(routineId);
        if (!routine) return;

        const s = routine.series?.[editingSeriesIndex];
        if (!s) return;

        s.description = String(editSeriesDescription.value ?? "").trim();
        s.restSecondsAfter = toNonNegativeNumber(editSeriesRest.value, 0);

        routineStore.update(routine);
        if (onRoutineChanged) onRoutineChanged(routine);
        flashOk(btnSaveSeries);
    });

    btnAddRepGroup.addEventListener("click", () => {
        if (editingSeriesIndex === null) return;

        const routineId = getCurrentRoutineId();
        const routine = routineStore.getById(routineId);
        if (!routine) return;

        const s = routine.series?.[editingSeriesIndex];
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
        if (onRoutineChanged) onRoutineChanged(routine);
        flashOk(btnAddRepGroup);
    });

    repGroupList.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action='remove-repGroup']");
        if (!btn) return;

        const idx = Number(btn.getAttribute("data-index"));
        if (!Number.isInteger(idx)) return;

        if (editingSeriesIndex === null) return;

        const routineId = getCurrentRoutineId();
        const routine = routineStore.getById(routineId);
        if (!routine) return;

        const s = routine.series?.[editingSeriesIndex];
        if (!s) return;

        const ok = confirm(removeRepGroupConfirmLabel(idx + 1));
        if (!ok) return;

        s.repGroups.splice(idx, 1);
        routineStore.update(routine);
        renderRepGroups(s);
        if (onRoutineChanged) onRoutineChanged(routine);
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

            const reps = g.targetReps ?? t("common.dash");
            const restSeconds = Number(g.restSecondsAfter ?? 0);

            let weightText = t("common.dash");
            if (typeof g.targetWeight === "number") {
                weightText = String(g.targetWeight);
            } else if (g.targetWeight && typeof g.targetWeight === "object") {
                weightText = `${g.targetWeight.left} / ${g.targetWeight.right}`;
            }

            const row = document.createElement("div");
            row.className = "routineRow";
            row.innerHTML = `
                <div class="routineMeta">
                    <h3>${escapeHtml(repGroupTitleLabel(i + 1))}</h3>
                    <p>
                        ${escapeHtml(
                            repGroupSummaryLabel({
                                laterality: g.laterality,
                                reps,
                                weight: weightText,
                                restSeconds,
                            })
                        )}
                    </p>
                </div>
                <div class="rowActions">
                    <button class="btn danger" data-action="remove-repGroup" data-index="${i}">
                        ${escapeHtml(t("common.remove"))}
                    </button>
                </div>
            `;
            repGroupList.appendChild(row);
        }
    }

    return {
        open,
        close,
        isOpenForIndex,
        adjustIndexAfterSeriesRemoved,
    };
}