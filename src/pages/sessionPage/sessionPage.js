// src/pages/sessionPage.js

import { t } from "/src/internationalization/i18n.js";

import { escapeHtml } from "/src/ui/dom.js";
import { formatMs } from "/src/utils/numberFormat.js";
import { attachDragReorder, moveItem } from "/src/ui/common/reorderUtils.js";

export function mountSessionPage({ routineStore, exerciseStore }) {
    const titleEl = document.getElementById("sessionTitle");
    const metaEl = document.getElementById("sessionRoutineMeta");

    const timerEl = document.getElementById("sessionTimer");
    const btnStartPause = document.getElementById("btnSessionStartPause");
    const btnReset = document.getElementById("btnSessionReset");

    const listEl = document.getElementById("sessionSeriesList");
    const emptyEl = document.getElementById("sessionEmpty");
    const notFoundEl = document.getElementById("sessionNotFound");

    // --- insert "current exercise" section just below the timer ROW (not inside it) ---
    const sessionFormEl = timerEl?.closest(".form");
    const timerRowEl = sessionFormEl ? sessionFormEl.querySelector(":scope > div") : null;

    const currentSectionEl = document.createElement("div");
    currentSectionEl.id = "sessionCurrentExercise";
    currentSectionEl.style.marginTop = "10px";
    currentSectionEl.style.paddingTop = "10px";
    currentSectionEl.style.borderTop = "1px solid var(--border)";
    currentSectionEl.style.display = "none";

    if (timerRowEl) {
        timerRowEl.insertAdjacentElement("afterend", currentSectionEl);
    } else if (sessionFormEl) {
        sessionFormEl.insertAdjacentElement("afterbegin", currentSectionEl);
    }

    // --- timer state ---
    let running = false;
    let startEpochMs = null;
    let elapsedMs = 0;
    let tickHandle = null;
    // --- rest timer state ---
    let restRunning = false;
    let restStartEpochMs = null;
    let restDurationMs = 0;
    let restTickHandle = null;

    // --- session progress state (series + repGroups status) ---
    let currentRoutineId = null;

    let currentSeriesIndex = 0; // active exercise (index in ORIGINAL routine.series)
    let currentRepGroupIndex = 0; // active set within exercise

    let completedSeries = new Set(); // indices marked completed (derived/optional)
    let completedRepGroups = new Map(); // seriesIdx -> Set(repIdx)

    // Local display order
    let sessionSeriesOrder = null;

    function stopTick() {
        if (tickHandle) {
            clearInterval(tickHandle);
            tickHandle = null;
        }
    }

    function syncStartPauseLabel() {
        const key = running ? "session.timer.pause" : "session.timer.start";
        const label = t(key);

        btnStartPause.textContent = label;
        btnStartPause.title = label;
        btnStartPause.setAttribute("aria-label", label);
    }

    function updateTimerUI() {
        timerEl.textContent = formatMs(elapsedMs);
        syncStartPauseLabel();
    }

    function startTimer() {
        if (running) return;
        running = true;
        startEpochMs = Date.now() - elapsedMs;

        stopTick();
        tickHandle = window.setInterval(() => {
            if (!running) return;
            elapsedMs = Date.now() - startEpochMs;
            updateTimerUI();
        }, 250);

        updateTimerUI();
    }

    function pauseTimer() {
        if (!running) return;
        running = false;
        stopTick();
        updateTimerUI();
    }

    function resetTimer() {
        running = false;
        stopTick();
        startEpochMs = null;
        elapsedMs = 0;
        updateTimerUI();
    }

    function resetRestTimer() {
        restRunning = false;
        restStartEpochMs = null;
        restDurationMs = 0;
        stopRestTick();
        updateRestTimerUI();
    }

    function stopRestTick() {
        if (restTickHandle) {
            clearInterval(restTickHandle);
            restTickHandle = null;
        }
    }

    function updateRestTimerUI() {
        const valueEl = currentSectionEl?.querySelector("#currentSetTimerValue");
        const labelEl = currentSectionEl?.querySelector(".currentSetTimerLabel");
        if (!valueEl || !labelEl) return;

        if (!restRunning) {
            labelEl.textContent = t("session.currentSet.timer") || "Set timer";
            valueEl.textContent = "00:00";
            return;
        }

        const now = Date.now();
        const elapsed = now - restStartEpochMs;
        const remaining = Math.max(0, restDurationMs - elapsed);

        labelEl.textContent = t("session.rest") || "Rest";
        valueEl.textContent = formatMs(remaining);

        if (remaining <= 0) {
            restRunning = false;
            stopRestTick();
            updateRestTimerUI();
            renderCurrent();
        }
    }

    function startRest(seconds) {
        const s = Number(seconds);
        if (!Number.isFinite(s) || s <= 0) {
            restRunning = false;
            stopRestTick();
            updateRestTimerUI();
            return;
        }

        restRunning = true;
        restDurationMs = Math.round(s * 1000);
        restStartEpochMs = Date.now();

        stopRestTick();
        restTickHandle = window.setInterval(() => {
            if (!restRunning) return;
            updateRestTimerUI();
        }, 250);

        updateRestTimerUI();
    }

    btnStartPause.addEventListener("click", () => {
        if (running) pauseTimer();
        else startTimer();
    });

    btnReset.addEventListener("click", () => {
        resetTimer();
        const resetLabel = t("session.timer.reset");
        btnReset.title = resetLabel;
        btnReset.setAttribute("aria-label", resetLabel);
    });

    function isRepDone(seriesIdx, repIdx) {
        return completedRepGroups.get(seriesIdx)?.has(repIdx) === true;
    }

    function markRepDone(seriesIdx, repIdx) {
        if (!completedRepGroups.has(seriesIdx)) completedRepGroups.set(seriesIdx, new Set());
        completedRepGroups.get(seriesIdx).add(repIdx);
    }

    function statusForRep(seriesIdx, repIdx) {
        if (isRepDone(seriesIdx, repIdx)) return "done";
        if (seriesIdx === currentSeriesIndex && repIdx === currentRepGroupIndex) return "active";
        return "todo";
    }

    function statusForSeries(seriesIdx, routine) {
        const groups = routine?.series?.[seriesIdx]?.repGroups ?? [];
        if (!groups.length) return seriesIdx === currentSeriesIndex ? "active" : "todo";

        const allDone = groups.every((_, i) => isRepDone(seriesIdx, i));
        if (allDone) return "done";
        if (seriesIdx === currentSeriesIndex) return "active";
        return "todo";
    }

    function recomputeCompletedSeries(routine) {
        const series = routine?.series ?? [];
        const nextCompleted = new Set();

        for (let s = 0; s < series.length; s += 1) {
            const groups = Array.isArray(series[s]?.repGroups) ? series[s].repGroups : [];
            if (!groups.length) continue;

            const allDone = groups.every((_, i) => isRepDone(s, i));
            if (allDone) nextCompleted.add(s);
        }

        completedSeries = nextCompleted;
    }

    function advanceToNext(routine) {
        const series = routine?.series ?? [];
        const sMax = series.length;

        // 1) next rep in same series
        const groups = Array.isArray(series[currentSeriesIndex]?.repGroups)
            ? series[currentSeriesIndex].repGroups
            : [];

        let r = currentRepGroupIndex + 1;
        while (r < groups.length && isRepDone(currentSeriesIndex, r)) r += 1;

        if (r < groups.length) {
            currentRepGroupIndex = r;
            return;
        }

        // 2) next series that has an incomplete rep
        let s = currentSeriesIndex + 1;
        while (s < sMax) {
            const g = Array.isArray(series[s]?.repGroups) ? series[s].repGroups : [];
            let first = 0;
            while (first < g.length && isRepDone(s, first)) first += 1;

            if (first < g.length) {
                currentSeriesIndex = s;
                currentRepGroupIndex = first;
                return;
            }
            s += 1;
        }
        // If we're here, everything after is done; keep position as-is.
    }

    function resolveExerciseName(seriesItem) {
        const id = seriesItem?.exerciseId;
        if (!id) return t("session.exercise.unknown");

        const ex =
            exerciseStore?.getById?.(id) ||
            exerciseStore?.list?.()?.find?.((e) => e.id === id) ||
            null;

        return ex?.name || ex?.description || id;
    }

    function formatSideValue(v) {
        if (v == null) return "—";
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
            const left = v.left ?? "—";
            const right = v.right ?? "—";
            return `${left}/${right}`;
        }
        return String(v);
    }

    function resolveRepValue(repGroup, field /* "targetWeight" | "targetReps" */) {
        const hist = Array.isArray(repGroup?.history) ? repGroup.history : [];
        const last = hist.length ? hist[hist.length - 1] : null;

        if (field === "targetWeight") return last?.weight ?? repGroup?.targetWeight ?? null;
        if (field === "targetReps") return last?.reps ?? repGroup?.targetReps ?? null;

        return null;
    }

    function renderCurrentExercise(routine) {
        if (!currentSectionEl) return;

        const series = Array.isArray(routine?.series) ? routine.series : [];
        const s = series[currentSeriesIndex] || null;

        if (!s) {
            currentSectionEl.style.display = "none";
            currentSectionEl.innerHTML = "";
            return;
        }

        const name = resolveExerciseName(s);
        const seriesDesc = s?.description ? String(s.description) : "";
        const descSuffix = seriesDesc ? ` — <span class="muted">${escapeHtml(seriesDesc)}</span>` : "";

        const groups = Array.isArray(s?.repGroups) ? s.repGroups : [];
        const rg = groups[currentRepGroupIndex] || null;

        const weightLabel = t("session.weight") || "Weight";
        const repsLabel = t("session.reps") || "Reps";

        // ----- Current set subsection (only if a set exists) -----
        let currentSetHtml = "";
        if (rg) {
            const weight = resolveRepValue(rg, "targetWeight");
            const reps = resolveRepValue(rg, "targetReps");
            const weightTxt = formatSideValue(weight);
            const repsTxt = formatSideValue(reps);

            const timerLabel = t("session.currentSet.timer") || "Set timer";
            const isDisabled = restRunning === true;
            const btnLabel = isDisabled
                ? (t("session.currentSet.restTimer") || "Rest timer")
                : (t("session.currentSet.complete") || "Complete set");

            currentSetHtml = `
                <div class="currentExerciseSubdivider"></div>

                <div class="currentSetRow">
                    <div class="currentSetTimer" aria-label="${escapeHtml(timerLabel)}">
                    <div class="currentSetTimerLabel">${escapeHtml(timerLabel)}</div>
                    <div class="currentSetTimerValue" id="currentSetTimerValue">00:00</div>
                    </div>

                    <div class="currentSetMetrics">
                    <div class="currentSetMetricsTop">
                        <span class="currentSetBadge">${escapeHtml(t("session.set") || "Set")} ${currentRepGroupIndex + 1}</span>
                    </div>

                    <div style="margin-top:8px; display:flex; gap:14px; flex-wrap:wrap;">
                        <div class="currentSetMetricLine">
                        <span class="muted">${escapeHtml(weightLabel)}:</span> ${escapeHtml(weightTxt)}
                        </div>
                        <div class="currentSetMetricLine">
                        <span class="muted">${escapeHtml(repsLabel)}:</span> ${escapeHtml(repsTxt)}
                        </div>
                    </div>
                    </div>

                    <div class="currentSetActions">
                        <button
                            type="button"
                            class="currentSetDoneIconBtn"
                            data-action="complete-current-set"
                            ${isDisabled ? "disabled" : ""}
                            title="${escapeHtml(btnLabel)}"
                            aria-label="${escapeHtml(btnLabel)}"
                        >
                            <span class="currentSetDoneIcon" aria-hidden="true">✓</span>
                        </button>
                    </div>
                </div>
            `;
        }

        // ----- All sets subsection (your existing squares flow) -----
        const flow = groups.map((rg2, repIdx) => {
            const st = statusForRep(currentSeriesIndex, repIdx);

            const weight = resolveRepValue(rg2, "targetWeight");
            const reps = resolveRepValue(rg2, "targetReps");
            const weightTxt = formatSideValue(weight);
            const repsTxt = formatSideValue(reps);

            const border =
                st === "active" ? "rgba(96, 165, 250, 0.55)"
                    : st === "done" ? "rgba(34, 197, 94, 0.55)"
                        : "var(--border)";

            const bg =
                st === "active" ? "rgba(96, 165, 250, 0.10)"
                    : st === "done" ? "rgba(34, 197, 94, 0.08)"
                        : "rgba(255, 255, 255, 0.02)";

            const square = `
          <button
            type="button"
            data-action="focus-current-rep"
            data-rep-idx="${repIdx}"
            aria-label="${escapeHtml((t("session.set") || "Set"))} ${repIdx + 1}"
            style="
              min-width: 64px;
              height: 64px;
              border-radius: 12px;
              border: 1px solid ${border};
              background: ${bg};
              color: var(--text);
              display: grid;
              grid-template-rows: auto 1fr;
              align-content: start;
              gap: 4px;
              padding: 6px;
            "
          >
            <div style="font-size:12px; font-weight:800; line-height:1;">${repIdx + 1}</div>
            <div style="font-size:11px; line-height:1.15; text-align:left;">
              <div><span class="muted">${escapeHtml(weightLabel)}:</span> ${escapeHtml(weightTxt)}</div>
              <div><span class="muted">${escapeHtml(repsLabel)}:</span> ${escapeHtml(repsTxt)}</div>
            </div>
          </button>
        `;

            const restSeconds = typeof rg2?.restSecondsAfter === "number" ? rg2.restSecondsAfter : 0;
            const between = (repIdx < groups.length - 1)
                ? `
              <div aria-hidden="true" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; min-width:44px;">
                <div style="font-size:18px; line-height:1; color: var(--muted);">→</div>
                ${restSeconds > 0
                    ? `<div style="font-size:12px; color: var(--muted); font-weight:700; line-height:1;">${restSeconds}s</div>`
                    : `<div style="font-size:12px; color: var(--muted); opacity:0.65; font-weight:700; line-height:1;">—</div>`
                }
              </div>
            `
                : "";

            return square + between;
        }).join("");

        const allSetsLabel = escapeHtml(t("session.allSets") || "All sets");

        currentSectionEl.style.display = "";
        currentSectionEl.innerHTML = `
      <div class="currentExerciseHeader">
        <div class="currentExerciseTitleWrap">
          <div class="currentExerciseLabel">${escapeHtml(t("session.currentExercise") || "Current exercise")}</div>
          <div class="currentExerciseName">
            ${escapeHtml(name)}${descSuffix}
          </div>
        </div>

        <div class="currentExerciseIdx">
          ${escapeHtml((t("session.exercise") || "Exercise"))} ${currentSeriesIndex + 1}/${series.length}
        </div>
      </div>

      ${currentSetHtml}

      <div class="currentExerciseSubdivider"></div>

      <div class="allSetsLabel">${allSetsLabel}</div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        ${flow || `<span class="muted">${escapeHtml(t("session.noSets") || "No sets")}</span>`}
      </div>
    `;
    }

    currentSectionEl?.addEventListener("click", (e) => {
        const completeBtn = e.target.closest('[data-action="complete-current-set"]');
        if (completeBtn) {
            if (restRunning) return;
            const routine = currentRoutineId ? routineStore.getById(currentRoutineId) : null;
            if (!routine) return;

            const series = Array.isArray(routine.series) ? routine.series : [];
            const s = series[currentSeriesIndex] || null;
            const groups = Array.isArray(s?.repGroups) ? s.repGroups : [];
            const rg = groups[currentRepGroupIndex] || null;

            if (!s || !rg) return;

            if (isRepDone(currentSeriesIndex, currentRepGroupIndex)) return;

            const isLastSetInExercise = currentRepGroupIndex >= groups.length - 1;

            const restSecondsAfterSet =
                typeof rg.restSecondsAfter === "number" ? rg.restSecondsAfter : 0;

            const restSecondsAfterExercise =
                typeof s.restSecondsAfter === "number" ? s.restSecondsAfter : 0;

            const restToRun = isLastSetInExercise ? restSecondsAfterExercise : restSecondsAfterSet;

            markRepDone(currentSeriesIndex, currentRepGroupIndex);

            recomputeCompletedSeries(routine);
            advanceToNext(routine);

            startRest(restToRun);
            renderCurrent();

            return;
        }

        const focusBtn = e.target.closest('[data-action="focus-current-rep"]');
        if (focusBtn) {
            const repIdx = Number(focusBtn.dataset.repIdx);
            if (!Number.isFinite(repIdx)) return;

            currentRepGroupIndex = repIdx;

            restRunning = false;
            stopRestTick();

            renderCurrent();
            return;
        }
    });

    function renderRepGroupList(seriesIdx, s) {
        const groups = Array.isArray(s?.repGroups) ? s.repGroups : [];
        if (!groups.length) return "";

        const weightLabel = t("session.weight") || "Weight";
        const repsLabel = t("session.reps") || "Reps";

        return `
      <div class="repGroupList" role="list">
        ${groups
                .map((rg, repIdx) => {
                    const weight = resolveRepValue(rg, "targetWeight");
                    const reps = resolveRepValue(rg, "targetReps");

                    const weightTxt = formatSideValue(weight);
                    const repsTxt = formatSideValue(reps);

                    const rest = typeof rg?.restSecondsAfter === "number" && rg.restSecondsAfter > 0
                        ? `<span class="chip">${escapeHtml(t("session.rest"))} ${rg.restSecondsAfter}s</span>`
                        : "";

                    const st = statusForRep(seriesIdx, repIdx);
                    const icon = st === "done" ? "✓" : st === "active" ? "▶" : "•";

                    return `
              <div class="repGroupItem repGroupItem--${st}"
                   role="listitem"
                   data-series-idx="${seriesIdx}"
                   data-rep-idx="${repIdx}">
                <div class="repGroupMain">
                  <span class="repGroupIdx">${repIdx + 1}</span>

                  <span class="repGroupMetric">
                    <span class="muted">${escapeHtml(weightLabel)}:</span>
                    ${escapeHtml(weightTxt)}
                  </span>

                  <span class="repGroupMetric">
                    <span class="muted">${escapeHtml(repsLabel)}:</span>
                    ${escapeHtml(repsTxt)}
                  </span>

                  ${rest}
                </div>

                <div class="repGroupActions">
                  <span class="seriesStatus" aria-hidden="true">${icon}</span>
                </div>
              </div>
            `;
                })
                .join("")}
      </div>
    `;
    }

    listEl.addEventListener("click", (e) => {
        const repItem = e.target.closest(".repGroupItem");
        const seriesItem = e.target.closest(".seriesItem");

        const completeRepBtn = e.target.closest('[data-action="complete-rep"]');
        if (completeRepBtn && repItem) {
            const sIdx = Number(repItem.dataset.seriesIdx);
            const rIdx = Number(repItem.dataset.repIdx);
            if (!Number.isFinite(sIdx) || !Number.isFinite(rIdx)) return;

            markRepDone(sIdx, rIdx);

            const routine = currentRoutineId ? routineStore.getById(currentRoutineId) : null;
            if (routine) {
                currentSeriesIndex = sIdx;
                currentRepGroupIndex = rIdx;

                recomputeCompletedSeries(routine);
                advanceToNext(routine);
            }

            renderCurrent();
            return;
        }

        if (repItem) {
            return;
        }

        if (seriesItem) {
            return;
        }
    });

    function reorderSeriesAndSave(fromIdx, toIdx) {
        const routine = currentRoutineId ? routineStore.getById(currentRoutineId) : null;
        if (!routine) return;

        const series = Array.isArray(routine.series) ? routine.series : [];
        if (!sessionSeriesOrder) sessionSeriesOrder = series.map((_, i) => i);

        const n = sessionSeriesOrder.length;
        if (
            !Number.isInteger(fromIdx) || !Number.isInteger(toIdx) ||
            fromIdx < 0 || toIdx < 0 || fromIdx >= n || toIdx >= n
        ) return;

        moveItem(sessionSeriesOrder, fromIdx, toIdx);

        renderSeriesList(routine);
    }

    // Attach once (no need to reattach on each render)
    attachDragReorder(listEl, {
        rowSelector: '.seriesBlock[data-index]',
        onReorder: (fromIdx, toIdx) => reorderSeriesAndSave(fromIdx, toIdx),
    });

    function renderSeriesList(routine) {
        const series = Array.isArray(routine?.series) ? routine.series : [];

        if (!sessionSeriesOrder || sessionSeriesOrder.length !== series.length) {
            sessionSeriesOrder = series.map((_, i) => i);
        }

        emptyEl.style.display = series.length ? "none" : "";
        listEl.innerHTML = "";
        if (!series.length) return;

        recomputeCompletedSeries(routine);

        renderCurrentExercise(routine);

        listEl.innerHTML = sessionSeriesOrder
            .map((origIdx, displayIdx) => {
                const s = series[origIdx];
                const idx = origIdx;

                const name = resolveExerciseName(s);
                const desc = s.description
                    ? ` — <span class="muted">${escapeHtml(s.description)}</span>`
                    : "";

                const repCount = Array.isArray(s?.repGroups) ? s.repGroups.length : 0;
                const countChip = repCount > 0
                    ? `<span class="chip">${repCount} ${escapeHtml(t("session.sets") || "sets")}</span>`
                    : "";

                const seriesRestAfter =
                    typeof s.restSecondsAfter === "number" && s.restSecondsAfter > 0
                        ? `<span class="chip" style="margin-left:8px;">${escapeHtml(
                            t("session.rest")
                        )} ${s.restSecondsAfter}s</span>`
                        : "";

                const status = statusForSeries(idx, routine);
                const statusIcon = status === "done" ? "✓" : status === "active" ? "▶" : "•";

                const showSublist = idx === currentSeriesIndex;

                return `
        <div class="seriesBlock" data-index="${displayIdx}" draggable="true" style="cursor:grab;">
          <div class="seriesItem seriesItem--${status}" data-series-idx="${idx}">
            <div class="seriesItemMeta">
              <h4>${idx + 1}. ${escapeHtml(name)}${desc}</h4>
              <p style="margin-top:8px;">${countChip}${seriesRestAfter}</p>
            </div>

            <div class="seriesItemActions">
              <span class="seriesStatus" aria-hidden="true">${statusIcon}</span>
            </div>
          </div>

          <div class="seriesSublist ${showSublist ? "" : "is-collapsed"}">
            ${showSublist ? renderRepGroupList(idx, s) : ""}
          </div>
        </div>
      `;
            })
            .join("");

        requestAnimationFrame(() => {
            const active =
                listEl.querySelector(".repGroupItem--active") ||
                listEl.querySelector('.seriesBlock[data-series-idx="' + currentSeriesIndex + '"]');
            active?.scrollIntoView?.({ block: "nearest" });
        });
    }

    function renderCurrent() {
        const routine = currentRoutineId ? routineStore.getById(currentRoutineId) : null;
        if (!routine) return;
        renderSeriesList(routine);
    }

    return {
        render(params) {
            resetTimer();
            resetRestTimer();

            const resetLabel = t("session.timer.reset");
            btnReset.textContent = resetLabel;
            btnReset.title = resetLabel;
            btnReset.setAttribute("aria-label", resetLabel);

            syncStartPauseLabel();

            notFoundEl.style.display = "none";

            const routineId = params?.routineId ?? null;
            currentRoutineId = routineId;

            currentSeriesIndex = 0;
            currentRepGroupIndex = 0;

            completedSeries = new Set();
            completedRepGroups = new Map();

            sessionSeriesOrder = null;

            const routine = routineId ? routineStore.getById(routineId) : null;

            if (!routine) {
                metaEl.textContent = "—";
                listEl.innerHTML = "";
                emptyEl.style.display = "none";
                notFoundEl.style.display = "";
                currentSectionEl.style.display = "none";
                currentSectionEl.innerHTML = "";
                restRunning = false;
                stopRestTick();
                return;
            }

            metaEl.textContent = routine.description ? routine.description : "—";

            renderSeriesList(routine);
        },
    };
}