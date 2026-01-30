// pages/routineDetail/seriesEditorView.js

import { t } from "/src/internationalization/i18n.js";
import { RepGroup, Laterality } from "../../../models/repGroup.js";
import { flashMoved, moveItem, attachDragReorder } from "/src/ui/common/reorderUtils.js";
import {
    escapeHtml,
    flashInvalid,
    flashOk,
} from "./viewUtils.js";
import {
    toNonNegativeNumber,
    toPositiveInt,
    toNullableNumber,
} from "/src/utils/numberFormat.js";

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

function upsertPerformedHistory(repGroup, reps, weight) {
    const dateTime = new Date().toISOString();

    if (repGroup && typeof repGroup.upsertHistory === "function") {
        repGroup.upsertHistory(dateTime, { reps, weight });
        return;
    }

    if (!repGroup) return;
    if (!Array.isArray(repGroup.history)) repGroup.history = [];

    const entry = { dateTime, reps, weight };
    const idx = repGroup.history.findIndex((e) => e.dateTime === dateTime);
    if (idx >= 0) repGroup.history[idx] = entry;
    else repGroup.history.push(entry);

    repGroup.history.sort((a, b) => Date.parse(a.dateTime) - Date.parse(b.dateTime));
}

function formatRepsForSummary(reps) {
    if (reps == null) return t("common.dash");
    if (typeof reps === "number") return String(reps);
    if (typeof reps === "object") {
        const l = reps.left ?? t("common.dash");
        const r = reps.right ?? t("common.dash");
        return `${l} / ${r}`;
    }
    return String(reps);
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

    const rgRepsSingleWrap = document.getElementById("rgRepsSingleWrap");
    const rgRepsTupleWrap = document.getElementById("rgRepsTupleWrap");
    const rgTargetReps = document.getElementById("rgTargetReps");
    const rgRepsLeft = document.getElementById("rgRepsLeft");
    const rgRepsRight = document.getElementById("rgRepsRight");

    const rgWeightSingleWrap = document.getElementById("rgWeightSingleWrap");
    const rgWeightTupleWrap = document.getElementById("rgWeightTupleWrap");
    const rgWeightSingle = document.getElementById("rgWeightSingle");
    const rgWeightLeft = document.getElementById("rgWeightLeft");
    const rgWeightRight = document.getElementById("rgWeightRight");

    const rgRestAfter = document.getElementById("rgRestAfter");
    const btnAddRepGroup = document.getElementById("btnAddRepGroup");

    let editingSeriesIndex = null;
    let editingRepGroupIndex = null;

    const defaultAddRepGroupBtnLabel = btnAddRepGroup.textContent;
    const btnCancelRepGroupEdit = document.getElementById("btnCancelRepGroupEdit");

    btnCloseSeriesEditor.addEventListener("click", () => {
        close();
    });

    if (btnCancelRepGroupEdit) {
        btnCancelRepGroupEdit.addEventListener("click", () => {
            exitRepGroupEditMode();
        });
    }

    rgLaterality.addEventListener("change", () => {
        syncLateralityUI();
    });

    function parseRepsFromFields(laterality) {
        if (laterality === Laterality.UNILATERAL) {
            const lRaw = String(rgRepsLeft?.value ?? "").trim();
            const rRaw = String(rgRepsRight?.value ?? "").trim();

            const left = lRaw === "" ? null : toPositiveInt(lRaw);
            const right = rRaw === "" ? null : toPositiveInt(rRaw);

            if (lRaw !== "" && !left) return null;
            if (rRaw !== "" && !right) return null;
            if (left == null && right == null) return null;

            return { left, right };
        }

        const v = toPositiveInt(String(rgTargetReps?.value ?? "").trim());
        return v || null;
    }

    function setRepsFieldsFromValue(reps, laterality) {
        if (laterality === Laterality.UNILATERAL) {
            const obj = (reps && typeof reps === "object")
                ? { left: reps.left ?? null, right: reps.right ?? null }
                : (typeof reps === "number" ? { left: reps, right: reps } : { left: null, right: null });

            if (rgRepsLeft) rgRepsLeft.value = obj.left ?? "";
            if (rgRepsRight) rgRepsRight.value = obj.right ?? "";
            if (rgTargetReps) rgTargetReps.value = "";
            return;
        }

        if (rgTargetReps) rgTargetReps.value = typeof reps === "number" ? String(reps) : "";
        if (rgRepsLeft) rgRepsLeft.value = "";
        if (rgRepsRight) rgRepsRight.value = "";
    }

    function syncLateralityUI() {
        const lat = String(rgLaterality.value);

        if (lat === Laterality.UNILATERAL) {
            if (rgRepsSingleWrap) rgRepsSingleWrap.style.display = "none";
            if (rgRepsTupleWrap) rgRepsTupleWrap.style.display = "";
            rgWeightSingleWrap.style.display = "none";
            rgWeightTupleWrap.style.display = "";
        } else {
            if (rgRepsSingleWrap) rgRepsSingleWrap.style.display = "";
            if (rgRepsTupleWrap) rgRepsTupleWrap.style.display = "none";
            rgWeightSingleWrap.style.display = "";
            rgWeightTupleWrap.style.display = "none";
        }
    }

    function enterRepGroupEditMode(setSeries, repGroupIndex) {
        const g = setSeries.repGroups?.[repGroupIndex];
        if (!g) return;

        editingRepGroupIndex = repGroupIndex;

        rgLaterality.value = String(g.laterality);
        syncLateralityUI();

        setRepsFieldsFromValue(g.targetReps, String(g.laterality));

        if (typeof g.targetWeight === "number") {
            rgWeightSingle.value = String(g.targetWeight);
            rgWeightLeft.value = "";
            rgWeightRight.value = "";
        } else if (g.targetWeight && typeof g.targetWeight === "object") {
            rgWeightSingle.value = "";
            rgWeightLeft.value = String(g.targetWeight.left ?? "");
            rgWeightRight.value = String(g.targetWeight.right ?? "");
        } else {
            rgWeightSingle.value = "";
            rgWeightLeft.value = "";
            rgWeightRight.value = "";
        }

        rgRestAfter.value = String(Number(g.restSecondsAfter ?? 0));

        rgLaterality.disabled = true;

        btnAddRepGroup.textContent = escapeHtml(t("common.save"));
        if (btnCancelRepGroupEdit) btnCancelRepGroupEdit.style.display = "";
    }

    function exitRepGroupEditMode() {
        editingRepGroupIndex = null;
        rgLaterality.disabled = false;

        btnAddRepGroup.textContent = defaultAddRepGroupBtnLabel;
        if (btnCancelRepGroupEdit) btnCancelRepGroupEdit.style.display = "none";

        if (rgTargetReps) rgTargetReps.value = "";
        if (rgRepsLeft) rgRepsLeft.value = "";
        if (rgRepsRight) rgRepsRight.value = "";

        rgWeightSingle.value = "";
        rgWeightLeft.value = "";
        rgWeightRight.value = "";
        rgRestAfter.value = "";

        syncLateralityUI();
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
        exitRepGroupEditMode();
    }

    function close() {
        editingSeriesIndex = null;
        seriesEditor.style.display = "none";
        repGroupList.innerHTML = "";
        repGroupEmpty.style.display = "none";
        exitRepGroupEditMode();
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

    function reorderRepGroupsAndSave(fromIdx, toIdx) {
        if (editingSeriesIndex === null) return;

        const routineId = getCurrentRoutineId();
        const routine = routineStore.getById(routineId);
        if (!routine) return;

        const s = routine.series?.[editingSeriesIndex];
        if (!s) return;

        const n = s.repGroups?.length ?? 0;
        if (
            !Number.isInteger(fromIdx) || !Number.isInteger(toIdx) ||
            fromIdx < 0 || toIdx < 0 || fromIdx >= n || toIdx >= n
        ) return;

        moveItem(s.repGroups, fromIdx, toIdx);

        if (Number.isInteger(editingRepGroupIndex)) {
            if (editingRepGroupIndex === fromIdx) {
                editingRepGroupIndex = toIdx;
            } else if (fromIdx < editingRepGroupIndex && editingRepGroupIndex <= toIdx) {
                editingRepGroupIndex -= 1;
            } else if (toIdx <= editingRepGroupIndex && editingRepGroupIndex < fromIdx) {
                editingRepGroupIndex += 1;
            }
        }

        routineStore.update(routine);
        renderRepGroups(s);
        if (onRoutineChanged) onRoutineChanged(routine);

        requestAnimationFrame(() => {
            const movedRow = repGroupList.querySelector(`.routineRow[data-index="${toIdx}"]`);
            const otherRow = repGroupList.querySelector(`.routineRow[data-index="${fromIdx}"]`);
            flashMoved(movedRow, "moved");
            flashMoved(otherRow, "movedOther");
        });
    }

    attachDragReorder(repGroupList, {
        rowSelector: '.routineRow[data-index]',
        onReorder: reorderRepGroupsAndSave,
    });

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

        const isEditing = Number.isInteger(editingRepGroupIndex);

        const laterality = isEditing
            ? String(s.repGroups?.[editingRepGroupIndex]?.laterality)
            : String(rgLaterality.value);

        const targetReps = parseRepsFromFields(laterality);
        if (!targetReps) {
            flashInvalid(laterality === Laterality.UNILATERAL ? (rgRepsLeft || rgRepsRight) : rgTargetReps);
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

        if (isEditing) {
            const g = s.repGroups?.[editingRepGroupIndex];
            if (!g) return;

            g.targetReps = targetReps;
            g.targetWeight = targetWeight;
            g.restSecondsAfter = restSecondsAfter;

            upsertPerformedHistory(g, targetReps, targetWeight);

            routineStore.update(routine);
            renderRepGroups(s);
            if (onRoutineChanged) onRoutineChanged(routine);
            flashOk(btnAddRepGroup);

            exitRepGroupEditMode();
            return;
        }

        const rg = new RepGroup({
            exerciseId: s.exerciseId,
            laterality,
            targetReps,
            targetWeight,
            restSecondsAfter,
            history: [
                {
                    dateTime: new Date().toISOString(),
                    reps: targetReps,
                    weight: targetWeight,
                },
            ],
        });

        s.repGroups.push(rg);
        routineStore.update(routine);

        if (rgTargetReps) rgTargetReps.value = "";
        if (rgRepsLeft) rgRepsLeft.value = "";
        if (rgRepsRight) rgRepsRight.value = "";
        rgWeightSingle.value = "";
        rgWeightLeft.value = "";
        rgWeightRight.value = "";
        rgRestAfter.value = "";

        renderRepGroups(s);
        if (onRoutineChanged) onRoutineChanged(routine);
        flashOk(btnAddRepGroup);
    });

    repGroupList.addEventListener("click", (e) => {
        const row = e.target.closest(".routineRow");
        if (!row) return;

        const btn = e.target.closest("button[data-action][data-index]");
        const idx = Number((btn || row).getAttribute("data-index"));
        const action = btn ? btn.getAttribute("data-action") : "edit-repGroup";

        if (!Number.isInteger(idx)) return;
        if (editingSeriesIndex === null) return;

        const routineId = getCurrentRoutineId();
        const routine = routineStore.getById(routineId);
        if (!routine) return;

        const s = routine.series?.[editingSeriesIndex];
        if (!s) return;

        if (action === "edit-repGroup") {
            enterRepGroupEditMode(s, idx);
            return;
        }

        if (action === "move-up") {
            reorderRepGroupsAndSave(idx, idx - 1);
            return;
        }

        if (action === "move-down") {
            reorderRepGroupsAndSave(idx, idx + 1);
            return;
        }

        if (action === "remove-repGroup") {
            const ok = confirm(removeRepGroupConfirmLabel(idx + 1));
            if (!ok) return;

            s.repGroups.splice(idx, 1);

            if (Number.isInteger(editingRepGroupIndex)) {
                if (idx === editingRepGroupIndex) {
                    exitRepGroupEditMode();
                } else if (idx < editingRepGroupIndex) {
                    editingRepGroupIndex -= 1;
                }
            }

            routineStore.update(routine);
            renderRepGroups(s);
            if (onRoutineChanged) onRoutineChanged(routine);
        }
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

            const reps = formatRepsForSummary(g.targetReps);
            const restSeconds = Number(g.restSecondsAfter ?? 0);

            let weightText = t("common.dash");
            if (typeof g.targetWeight === "number") {
                weightText = String(g.targetWeight);
            } else if (g.targetWeight && typeof g.targetWeight === "object") {
                weightText = `${g.targetWeight.left} / ${g.targetWeight.right}`;
            }

            const row = document.createElement("div");
            row.className = "routineRow";
            row.setAttribute("data-index", String(i));
            row.setAttribute("draggable", "true");
            row.style.cursor = "grab";

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
                    <button class="btn" data-action="edit-repGroup" data-index="${i}">
                        ${escapeHtml(t("common.edit"))}
                    </button>
                    <button class="btn" data-action="move-up" data-index="${i}" ${i === 0 ? "disabled" : ""}>
                        ↑
                    </button>
                    <button class="btn" data-action="move-down" data-index="${i}" ${i === items.length - 1 ? "disabled" : ""}>
                        ↓
                    </button>
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