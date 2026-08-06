// src/pages/sessionPage.js

import { t } from "/src/internationalization/i18n.js";

import { escapeHtml } from "/src/ui/dom.js";
import { formatMs } from "/src/utils/numberFormat.js";
import { attachDragReorder, moveItem } from "/src/ui/common/reorderUtils.js";
import { openSessionSetModal } from "/src/ui/components/sessionSetModal.js";
import { RepGroup, Laterality } from "/src/models/repGroup.js";
import { SetSeries } from "/src/models/setSeries.js";
import { setLeaveGuard, clearLeaveGuard, navigate } from "/src/router.js";
import { mountRepGroupHistoryCharts } from "/src/ui/components/repGroupHistoryChart.js";
import { openWorkoutSummaryModal, computeSessionStats, computeSessionPRs } from "/src/ui/components/workoutSummaryModal.js";
import { areNotificationsEnabled } from "/src/services/notificationPreference.js";
import { clearSessionNotification } from "/src/services/sessionNotifications.js";
import {
    formatSideValue as formatSideValueValue,
    isSameWeight as isSameWeightValue,
    normalizeReps as normalizeRepsValue,
    normalizeWeight as normalizeWeightValue,
    resolveExerciseName as resolveExerciseNameValue,
    resolveRepValue as resolveRepValueValue,
} from "./sessionValueUtils.js";
import {
    advanceToNext as advanceToNextProgress,
    ensureSessionSeriesOrder as ensureSessionSeriesOrderProgress,
    hasCompletedAnyRep as hasCompletedAnyRepProgress,
    isRepDone as isRepDoneProgress,
    markRepDone as markRepDoneProgress,
    pickTopMostIncomplete as pickTopMostIncompleteProgress,
    recomputeCompletedSeries as recomputeCompletedSeriesProgress,
    shiftCompletedAfterInsert as shiftCompletedAfterInsertProgress,
    statusForRep as statusForRepProgress,
    statusForSeries as statusForSeriesProgress,
} from "./sessionProgress.js";
import {
    buildResumeSnapshot,
    deserializeAddedSeries,
    deserializeCompletedRepGroups,
    deserializeIdSet,
    isResumableFor,
    resolveResumePosition,
} from "./sessionResumeState.js";

export function mountSessionPage({ routineStore, exerciseStore, profileStore, workoutSessionStore }) {
    const titleEl = document.getElementById("sessionTitle");
    const metaEl = document.getElementById("sessionRoutineMeta");

    const timerEl = document.getElementById("sessionTimer");
    const btnStartPause = document.getElementById("btnSessionStartPause");
    const btnFinish = document.getElementById("btnSessionFinish");
    const btnStop = document.getElementById("btnSessionStop");

    const listEl = document.getElementById("sessionSeriesList");
    const emptyEl = document.getElementById("sessionEmpty");
    const notFoundEl = document.getElementById("sessionNotFound");

    const addExerciseInput = document.getElementById("sessionAddExerciseInput");
    const addExerciseOptionsEl = document.getElementById("sessionExerciseOptions");
    const btnAddExercise = document.getElementById("btnSessionAddExercise");

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

    let hasInitiated = false;
    let running = false;
    let startEpochMs = null;
    let elapsedMs = 0;
    let tickHandle = null;

    let restRunning = false;
    let restStartEpochMs = null;
    let restDurationMs = 0;
    let restTickHandle = null;
    let restPaused = false;
    let restRemainingMs = 0;

    let setRunning = false;
    let setStartEpochMs = null;
    let setElapsedMs = 0;
    let setTickHandle = null;

    let lastNotifyTs = 0;
    let lastNotifiedRestSecond = null;
    let lastActivePersistTs = 0;

    let cleanupCharts = null;

    let hasVibratedForRestEnd = false;
    function vibrateRestEnd() {
        if (!("vibrate" in navigator)) return;
        try {
            navigator.vibrate([150, 80, 150]);
        } catch {
        }
    }

    // Inline editing for current series description (notes)
    function syncDescInputOriginalValue() {
        const inp = currentSectionEl?.querySelector('[data-action="edit-series-desc"]');
        if (!inp) return;
        inp.dataset.original = inp.value ?? "";
    }

    // Click inline text → open full-width textarea
    currentSectionEl?.addEventListener("click", (e) => {
        const textEl = e.target.closest('[data-action="start-edit-desc"]');
        if (!textEl) return;
        const textarea = currentSectionEl.querySelector('[data-action="edit-series-desc"]');
        if (!textarea) return;
        textEl.style.display = "none";
        textarea.style.display = "";
        textarea.offsetHeight; // force reflow
        textarea.style.height = "0";
        textarea.style.height = textarea.scrollHeight + "px";
        textarea.focus();
    });

    currentSectionEl?.addEventListener("focusin", (e) => {
        const inp = e.target.closest('[data-action="edit-series-desc"]');
        if (!inp) return;
        if (inp.dataset.original == null) inp.dataset.original = inp.value ?? "";
    });

    currentSectionEl?.addEventListener("focusout", (e) => {
        const inp = e.target.closest('[data-action="edit-series-desc"]');
        if (!inp) return;

        // Hide textarea, restore inline text
        inp.style.display = "none";
        const textEl = currentSectionEl.querySelector('[data-action="start-edit-desc"]');
        if (textEl) {
            const placeholder = t("session.seriesDesc.placeholder");
            textEl.textContent = inp.value || placeholder;
            textEl.classList.toggle("currentSeriesDescText--empty", !inp.value);
            textEl.style.display = "";
        }

        // Commit on blur (immediate)
        persistCurrentSeriesDescription(inp.value);
        // Reset "original" baseline to the committed value
        inp.dataset.original = inp.value ?? "";
    });

    currentSectionEl?.addEventListener("input", (e) => {
        const inp = e.target.closest('[data-action="edit-series-desc"]');
        if (!inp) return;

        // Auto-resize textarea
        inp.style.height = "0";
        inp.style.height = inp.scrollHeight + "px";

        // Debounced persistence while typing
        persistCurrentSeriesDescriptionDebounced(inp.value);
    });

    currentSectionEl?.addEventListener("keydown", (e) => {
        const inp = e.target.closest('[data-action="edit-series-desc"]');
        if (!inp) return;

        // Enter inserts a newline naturally in textarea; no special handling needed

        if (e.key === "Escape") {
            e.preventDefault();
            const original = inp.dataset.original ?? "";
            inp.value = original;
            persistCurrentSeriesDescription(original);
            inp.blur();
        }
    });

    async function ensureNotificationPermission() {
        if (!areNotificationsEnabled()) return false;
        if (!("Notification" in window)) return false;
        if (Notification.permission === "granted") return true;
        if (Notification.permission === "denied") return false;

        const res = await Notification.requestPermission();
        return res === "granted";
    }

    navigator.serviceWorker?.addEventListener("message", (e) => {
        if (!e.data?.type) return;

        if (e.data.type === "NOTIFICATION_COMPLETE_SET") {
            handleQuickCompleteFromNotification();
        }
    });

    function isOnSessionRoute() {
        const pathname = location.pathname || "";
        return pathname.startsWith("/session/") || pathname === "/session";
    }

    function shouldBlockLeaving() {
        return hasInitiated === true;
    }

    function confirmLeaveSession() {
        return confirm(t("confirm.leaveSession"));
    }

    setLeaveGuard(({ fromPath, toPath }) => {
        const fromNorm = String(fromPath || "");
        const toNorm = String(toPath || "");
        const fromIsSession = fromNorm.startsWith("/session/") || fromNorm.startsWith("/session?") || fromNorm === "/session";
        const toIsSession = toNorm.startsWith("/session/") || toNorm.startsWith("/session?") || toNorm === "/session";

        if (!fromIsSession) return true;
        if (toIsSession) return true;

        if (!shouldBlockLeaving()) return true;

        return confirmLeaveSession();
    });

    function onBeforeUnload(e) {
        if (!isOnSessionRoute()) return;
        if (!shouldBlockLeaving()) return;

        persistActiveSessionState();

        e.preventDefault();
        e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);

    function debounce(fn, wait = 400) {
        let tId = null;
        return (...args) => {
            if (tId) clearTimeout(tId);
            tId = setTimeout(() => fn(...args), wait);
        };
    }

    function getCurrentRoutine() {
        return currentRoutineId ? routineStore.getById(currentRoutineId) : null;
    }

    // Real routine + this session's added exercises, as a read-only view. Used for
    // rendering, navigation and stats so those code paths don't need to know which
    // series are real (persisted) vs session-only. Never pass this into
    // routineStore.update() — that would bake the added series into storage.
    function getSessionRoutine() {
        const routine = getCurrentRoutine();
        if (!routine) return null;
        if (!addedSeries.length) return routine;
        return { ...routine, series: [...routine.series, ...addedSeries] };
    }

    // These three take the REAL (persisted) routine, never the combined view from
    // getSessionRoutine() — otherwise the "real" boundary they compute would already
    // include the added series and every index would look real.
    function realSeriesCount(routine) {
        return Array.isArray(routine?.series) ? routine.series.length : 0;
    }

    function isAddedSeriesIndex(routine, seriesIdx) {
        return seriesIdx >= realSeriesCount(routine);
    }

    function getAddedSeriesByIndex(routine, seriesIdx) {
        return addedSeries[seriesIdx - realSeriesCount(routine)] ?? null;
    }

    function getCurrentSeries(routine) {
        return routine?.series?.[currentSeriesIndex] ?? null;
    }

    function persistCurrentSeriesDescription(nextDescRaw) {
        const routine = getCurrentRoutine();
        if (!routine) return;

        const addedIdx = isAddedSeriesIndex(routine, currentSeriesIndex);
        const s = addedIdx ? getAddedSeriesByIndex(routine, currentSeriesIndex) : getCurrentSeries(routine);
        if (!s) return;

        const next = (nextDescRaw ?? "").trim();
        const prev = (s.description ?? "").trim();

        if (next === prev) return;

        s.description = next;

        if (addedIdx) persistActiveSessionState();
        else routineStore.update(routine);
    }

    const persistCurrentSeriesDescriptionDebounced =
        debounce(persistCurrentSeriesDescription, 500);

    function notifySessionState() {
        if (!areNotificationsEnabled()) return;
        if (!hasInitiated) return;
        if (!navigator.serviceWorker?.controller) return;
        if (Notification.permission !== "granted") return;
        if (document.visibilityState === "visible") return;

        const now = Date.now();

        let restRemainingLiveMs = restRemainingMs;

        if (restRunning && !restPaused && restStartEpochMs != null) {
            const elapsed = now - restStartEpochMs;
            restRemainingLiveMs = Math.max(0, restRemainingMs - elapsed);
        }

        if (restRunning) {
            const sec = Math.ceil(restRemainingLiveMs / 1000);
            if (sec === lastNotifiedRestSecond) return;
            lastNotifiedRestSecond = sec;
        } else {
            lastNotifiedRestSecond = null;
            if (now - lastNotifyTs <= 500) return;
            lastNotifyTs = now;
        }

        const routine = getSessionRoutine();
        if (!routine) return;

        const series = routine.series?.[currentSeriesIndex];
        if (!series) return;

        const rg = series.repGroups?.[currentRepGroupIndex] ?? null;

        const exercise = resolveExerciseName(series);
        const setLabel = rg
            ? `${t("session.set")} ${currentRepGroupIndex + 1}`
            : "";

        let weightTxt = "—";
        let repsTxt = "—";

        if (rg) {
            const weight = resolveRepValue(rg, "targetWeight");
            const reps = resolveRepValue(rg, "targetReps");
            weightTxt = formatSideValue(weight);
            repsTxt = formatSideValue(reps);
        }

        const timerTxt = restRunning
            ? `⏳ ${formatMs(restRemainingLiveMs)}`
            : `⏱ ${formatMs(setElapsedMs)}`;

        const restTxt = restRunning ? t("session.rest") : "";

        const body = [
            timerTxt,
            restTxt,
            `${weightTxt} × ${repsTxt}`,
            exercise,
            setLabel,
        ]
            .filter(Boolean)
            .join(" - ");

        const actionTitle = t("session.notification.setDone");

        navigator.serviceWorker.controller.postMessage({
            type: "SESSION_UPDATE",
            payload: {
                title: t("session.title"),
                body,
                restRunning,
                actionTitle,
            }
        });
    }

    function stopSetTick() {
        if (setTickHandle) {
            clearInterval(setTickHandle);
            setTickHandle = null;
        }
    }

    function startSetTimer({ reset = false } = {}) {
        if (reset) setElapsedMs = 0;
        if (setRunning) return;

        setRunning = true;
        setStartEpochMs = Date.now() - setElapsedMs;

        stopSetTick();
        setTickHandle = window.setInterval(() => {
            if (!setRunning) return;
            setElapsedMs = Date.now() - setStartEpochMs;
            updateCurrentSetTimerUI();
        }, 250);

        updateCurrentSetTimerUI();
        syncCurrentSetControls();
    }

    function pauseSetTimer() {
        if (!setRunning) return;
        setRunning = false;
        stopSetTick();
        updateCurrentSetTimerUI();
        syncCurrentSetControls();
    }

    function resetSetTimer() {
        setRunning = false;
        stopSetTick();
        setStartEpochMs = null;
        setElapsedMs = 0;
        updateCurrentSetTimerUI();
        syncCurrentSetControls();
    }

    let currentRoutineId = null;
    let activeWorkoutSessionId = null;
    let sessionStartedAtIso = null;
    let currentSeriesIndex = 0;
    let currentRepGroupIndex = 0;
    let completedSeries = new Set();
    let completedRepGroups = new Map();
    let sessionSeriesOrder = null;

    // Exercises/sets removed from *this* session only — never written back to the
    // stored Routine. Removed items are also marked done in completedRepGroups so
    // existing nav/completion logic (advanceToNext, isWorkoutComplete, ...) skips
    // them for free; these two sets exist purely to hide them from the UI.
    let removedSeriesIds = new Set();
    let removedRepGroupIds = new Set();

    // Exercises added to *this* session only — real SetSeries/RepGroup instances,
    // never written to the stored Routine. Always appended after the routine's own
    // series; getSessionRoutine() below is the one place that stitches them in so
    // rendering/nav/stats code can treat them exactly like real series.
    let addedSeries = [];

    let expandedSeries = new Set();

    function stopTick() {
        if (tickHandle) {
            clearInterval(tickHandle);
            tickHandle = null;
        }
    }

    function syncStartPauseLabel() {
        const isPaused = !running;
        const key = running ? "session.timer.pause" : "session.timer.start";
        const label = t(key);
        const icon = isPaused ? "▶" : "⏸";
        btnStartPause.innerHTML = `<span aria-hidden="true" style="margin-right:8px;">${icon}</span>${escapeHtml(label)}`;
        btnStartPause.title = label;
        btnStartPause.setAttribute("aria-label", label);
        syncSessionActionButtons();
    }

    function syncSessionActionButtons() {
        // .btn sets `display`, which beats the UA rule for [hidden] — set both.
        const display = hasInitiated ? "" : "none";
        for (const btn of [btnFinish, btnStop]) {
            if (!btn) continue;
            btn.hidden = !hasInitiated;
            btn.style.display = display;
        }
    }

    syncSessionActionButtons();

    // --- Resumable session state -------------------------------------------

    function persistActiveSessionState() {
        if (!workoutSessionStore?.setActiveState) return;
        if (!hasInitiated || !currentRoutineId) return;

        const nowMs = Date.now();
        lastActivePersistTs = nowMs;
        workoutSessionStore.setActiveState(buildResumeSnapshot({
            sessionId: activeWorkoutSessionId,
            routineId: currentRoutineId,
            startedAtIso: sessionStartedAtIso,
            running,
            startEpochMs,
            elapsedMs,
            currentSeriesIndex,
            currentRepGroupIndex,
            sessionSeriesOrder,
            completedRepGroups,
            removedSeriesIds,
            removedRepGroupIds,
            addedSeries,
        }, { nowMs, nowIso: new Date(nowMs).toISOString() }));
    }

    function persistActiveSessionStateThrottled() {
        if (Date.now() - lastActivePersistTs < 5000) return;
        persistActiveSessionState();
    }

    function clearActiveSessionState() {
        workoutSessionStore?.clearActiveState?.();
    }

    function readResumableState(routineId) {
        const state = workoutSessionStore?.getActiveState?.() ?? null;
        return isResumableFor(state, routineId) ? state : null;
    }

    function restoreSessionState(state) {
        activeWorkoutSessionId = state.sessionId ?? null;
        sessionStartedAtIso = state.startedAtIso ?? null;
        completedRepGroups = deserializeCompletedRepGroups(state.completedRepGroups);
        sessionSeriesOrder = Array.isArray(state.sessionSeriesOrder) ? state.sessionSeriesOrder.slice() : null;
        removedSeriesIds = deserializeIdSet(state.removedSeriesIds);
        removedRepGroupIds = deserializeIdSet(state.removedRepGroupIds);
        addedSeries = deserializeAddedSeries(state.addedSeries);

        elapsedMs = Math.max(0, Number(state.elapsedMs) || 0);
        startEpochMs = Date.now() - elapsedMs;
        running = false;
        hasInitiated = true;

        // addedSeries must be restored above before building this view, or the
        // resumed cursor/order would be computed against the wrong series count.
        const routine = getSessionRoutine();
        ensureSessionSeriesOrder(routine);
        recomputeCompletedSeries(routine);

        const position = resolveResumePosition(state, routine, completedRepGroups);
        currentSeriesIndex = position.seriesIdx;
        currentRepGroupIndex = position.repIdx;
        if (position.sessionSeriesOrder) sessionSeriesOrder = position.sessionSeriesOrder;

        updateTimerUI();
    }

    function updateTimerUI() {
        timerEl.textContent = formatMs(elapsedMs);
        syncStartPauseLabel();
        notifySessionState();
    }

    function startTimer() {
        if (running) return;

        if (!hasInitiated) {
            hasInitiated = true;
            ensureNotificationPermission();
        }

        if (!sessionStartedAtIso) sessionStartedAtIso = new Date().toISOString();

        running = true;

        if (restRunning && restPaused) resumeRestTimer();
        if (!restRunning) startSetTimer({ reset: setStartEpochMs == null && setElapsedMs === 0 });

        startEpochMs = Date.now() - elapsedMs;

        stopTick();
        tickHandle = window.setInterval(() => {
            if (!running) return;
            elapsedMs = Date.now() - startEpochMs;
            updateTimerUI();
            persistActiveSessionStateThrottled();
        }, 250);

        updateTimerUI();
        renderCurrent();
        syncCurrentSetControls();
        persistActiveSessionState();
    }

    function pauseTimer() {
        if (!running) return;
        running = false;
        stopTick();
        updateTimerUI();

        if (!restRunning) pauseSetTimer();
        if (restRunning && !restPaused) pauseRestTimer();
        syncCurrentSetControls();
        persistActiveSessionState();
    }

    function resetTimer() {
        running = false;
        stopTick();
        startEpochMs = null;
        elapsedMs = 0;
        updateTimerUI();
        clearSessionNotification();
    }

    function resetRestTimer() {
        restRunning = false;
        restPaused = false;
        restStartEpochMs = null;
        restDurationMs = 0;
        restRemainingMs = 0;
        hasVibratedForRestEnd = false;
        stopRestTick();
        updateCurrentSetTimerUI();
    }

    function endRestAndResumeSet({ resetSet = true } = {}) {
        restRunning = false;
        restPaused = false;
        restRemainingMs = 0;
        restDurationMs = 0;
        restStartEpochMs = null;
        hasVibratedForRestEnd = false;
        lastNotifiedRestSecond = null;
        stopRestTick();

        if (running) startSetTimer({ reset: resetSet });

        updateCurrentSetTimerUI();
        renderCurrent();
        syncCurrentSetControls();
        notifySessionState();
    }

    function buildSessionNotesSnapshot(routine) {
        const parts = [];
        for (const [idx, series] of (routine?.series ?? []).entries()) {
            const text = String(series?.description ?? "").trim();
            if (!text) continue;
            const exName = resolveExerciseName(series);
            parts.push(`${idx + 1}. ${exName}: ${text}`);
        }
        return parts.join("\n");
    }

    function latestBodyweightKg() {
        if (!profileStore?.listEntries) return null;
        const latest = profileStore.listEntries()[0] ?? null;
        const value = Number(latest?.weightKg);
        return Number.isFinite(value) && value > 0 ? value : null;
    }

    function isWorkoutComplete(routine) {
        const series = Array.isArray(routine?.series) ? routine.series : [];
        if (!series.length) return true;

        return series.every((s, sIdx) => {
            const groups = Array.isArray(s?.repGroups) ? s.repGroups : [];
            if (!groups.length) return true;
            return groups.every((_, rIdx) => isRepDone(sIdx, rIdx));
        });
    }

    function upsertWorkoutSessionSnapshot({ finalize = false } = {}) {
        if (!workoutSessionStore?.addSession) return null;

        const routine = getSessionRoutine();
        if (!routine) return null;

        const nowIso = new Date().toISOString();
        const sessionStartIso = sessionStartedAtIso
            ?? (startEpochMs != null ? new Date(startEpochMs).toISOString() : nowIso);
        const durationMs = running && startEpochMs != null
            ? Math.max(0, Date.now() - startEpochMs)
            : Math.max(0, elapsedMs);

        const stats = computeSessionStats(routine, sessionStartIso);
        const prDetection = computeSessionPRs(routine, sessionStartIso);

        const payload = {
            routineId: routine.id,
            routineName: routine.name || "",
            date: nowIso,
            startedAt: sessionStartIso,
            endedAt: nowIso,
            durationMs,
            sessionNotes: buildSessionNotesSnapshot(routine),
            rpe: null,
            bodyweightKg: latestBodyweightKg(),
            totals: {
                sets: stats.totalSets,
                reps: stats.totalReps,
                volume: stats.totalVolume,
                exercises: stats.exercises.length,
            },
            exerciseBreakdown: stats.exercises,
            prDetection,
            isCompleted: Boolean(finalize),
        };

        if (!activeWorkoutSessionId) {
            const created = workoutSessionStore.addSession(payload);
            activeWorkoutSessionId = created?.id || null;
            return created || null;
        }

        const updated = workoutSessionStore.updateSession(activeWorkoutSessionId, payload);
        if (updated) return updated;

        const recreated = workoutSessionStore.addSession({ ...payload, id: activeWorkoutSessionId });
        activeWorkoutSessionId = recreated?.id || activeWorkoutSessionId;
        return recreated || null;
    }

    async function endWorkoutSession() {
        const endEpochMs = Date.now();
        const durationMs = running && startEpochMs != null ? endEpochMs - startEpochMs : elapsedMs;
        const sessionStartIso = sessionStartedAtIso
            ?? (startEpochMs != null ? new Date(startEpochMs).toISOString() : null);
        const summaryRoutine = getSessionRoutine();
        const endedAtIso = new Date(endEpochMs).toISOString();

        cleanupCharts?.();
        cleanupCharts = null;

        running = false;

        stopTick();
        stopSetTick();
        stopRestTick();

        resetRestTimer();
        resetSetTimer();

        clearSessionNotification();
        hasInitiated = false;
        clearActiveSessionState();
        syncStartPauseLabel();
        renderCurrent();

        if (summaryRoutine && sessionStartIso) {
            const stats = computeSessionStats(summaryRoutine, sessionStartIso, { resolveExerciseName });
            const prDetection = computeSessionPRs(summaryRoutine, sessionStartIso, { resolveExerciseName });

            upsertWorkoutSessionSnapshot({ finalize: true });

            await openWorkoutSummaryModal({
                routine: summaryRoutine,
                sessionStartIso,
                durationMs,
                resolveExerciseName,
            });
        }

        // Cleared last: the snapshot above still needs the real session start.
        sessionStartedAtIso = null;
    }

    function hasCompletedAnyRep(seriesIdx) {
        return hasCompletedAnyRepProgress(completedRepGroups, seriesIdx);
    }

    function stopRestTick() {
        if (restTickHandle) {
            clearInterval(restTickHandle);
            restTickHandle = null;
        }
    }

    function normalizeWeight(w) {
        return normalizeWeightValue(w);
    }

    function normalizeReps(r) {
        return normalizeRepsValue(r);
    }

    function isSameWeight(a, b) {
        return isSameWeightValue(a, b);
    }

    function updateCurrentSetTimerUI() {
        const valueEl = currentSectionEl?.querySelector("#currentSetTimerValue");
        const labelEl = currentSectionEl?.querySelector(".currentSetTimerLabel");
        if (!valueEl || !labelEl) return;

        if (restRunning) {
            labelEl.textContent = t("session.currentSet.restTimer");

            if ((restRemainingMs ?? 0) <= 0) {
                endRestAndResumeSet({ resetSet: true });
                return;
            }

            if (restPaused) {
                valueEl.textContent = formatMs(Math.max(0, restRemainingMs));
                if ((restRemainingMs ?? 0) <= 0) {
                    endRestAndResumeSet({ resetSet: true });
                }
                return;
            }

            const now = Date.now();
            const elapsed = now - restStartEpochMs;
            const remaining = Math.max(0, restRemainingMs - elapsed);

            valueEl.textContent = formatMs(remaining);

            if (remaining <= 0) {
                restRunning = false;
                restPaused = false;
                restRemainingMs = 0;
                stopRestTick();

                if (!hasVibratedForRestEnd) {
                    hasVibratedForRestEnd = true;
                    vibrateRestEnd();
                }

                if (running) startSetTimer({ reset: true });

                updateCurrentSetTimerUI();
                renderCurrent();
                syncCurrentSetControls();
            }

            notifySessionState();
            return;
        }

        labelEl.textContent = t("session.currentSet.timer");
        valueEl.textContent = formatMs(setElapsedMs);
    }

    function startRest(seconds) {
        resetSetTimer();

        const s = Number(seconds);

        if (!Number.isFinite(s) || s <= 0) {
            endRestAndResumeSet({ resetSet: true });
            return;
        }

        restRunning = true;
        restPaused = false;
        restDurationMs = Math.round(s * 1000);
        restRemainingMs = restDurationMs;
        restStartEpochMs = Date.now();
        hasVibratedForRestEnd = false;
        lastNotifiedRestSecond = null;

        stopRestTick();
        restTickHandle = window.setInterval(() => {
            if (!restRunning || restPaused) return;
            updateCurrentSetTimerUI();
        }, 250);

        updateCurrentSetTimerUI();
        syncCurrentSetControls();
    }

    function pauseRestTimer() {
        if (!restRunning || restPaused) return;

        const now = Date.now();
        const elapsed = now - restStartEpochMs;
        restRemainingMs = Math.max(0, restRemainingMs - elapsed);

        if (restRemainingMs <= 0) {
            endRestAndResumeSet({ resetSet: true });
            return;
        }

        restPaused = true;
        stopRestTick();
        updateCurrentSetTimerUI();
    }

    function resumeRestTimer() {
        if (!restRunning || !restPaused) return;

        if (restRemainingMs <= 0) {
            endRestAndResumeSet({ resetSet: true });
            return;
        }

        restPaused = false;
        restStartEpochMs = Date.now();
        lastNotifiedRestSecond = null;

        stopRestTick();
        restTickHandle = window.setInterval(() => {
            if (!restRunning || restPaused) return;
            updateCurrentSetTimerUI();
        }, 250);

        updateCurrentSetTimerUI();
    }

    btnStartPause.addEventListener("click", () => {
        if (running) pauseTimer();
        else startTimer();
    });

    // Finish: close the session as completed even if some sets are pending.
    btnFinish?.addEventListener("click", async () => {
        if (!hasInitiated) return;

        const routine = getSessionRoutine();
        if (routine && !isWorkoutComplete(routine)) {
            const msg = t("confirm.finishIncompleteSession");
            if (!confirm(msg)) return;
        }

        clearActiveSessionState();
        await endWorkoutSession();
    });

    // Stop: leave the session unfinished, keeping progress so it can be resumed.
    btnStop?.addEventListener("click", () => {
        if (!hasInitiated) return;

        const msg = t("confirm.stopSession");
        if (!confirm(msg)) return;

        if (running) pauseTimer();

        upsertWorkoutSessionSnapshot({ finalize: false });
        persistActiveSessionState();

        running = false;
        stopTick();
        stopSetTick();
        stopRestTick();
        resetRestTimer();
        resetSetTimer();
        clearSessionNotification();
        cleanupCharts?.();
        cleanupCharts = null;

        hasInitiated = false;
        sessionStartedAtIso = null;
        syncStartPauseLabel();

        navigate("/routines");
    });

    function isRepDone(seriesIdx, repIdx) {
        return isRepDoneProgress(completedRepGroups, seriesIdx, repIdx);
    }

    function markRepDone(seriesIdx, repIdx) {
        markRepDoneProgress(completedRepGroups, seriesIdx, repIdx);
    }

    function shiftCompletedAfterInsert(seriesIdx, insertIdx) {
        shiftCompletedAfterInsertProgress(completedRepGroups, seriesIdx, insertIdx);
    }

    function statusForRep(seriesIdx, repIdx) {
        return statusForRepProgress({ completedRepGroups, currentSeriesIndex, currentRepGroupIndex }, seriesIdx, repIdx);
    }

    function statusForSeries(seriesIdx, routine) {
        return statusForSeriesProgress({ completedRepGroups, currentSeriesIndex, currentRepGroupIndex }, seriesIdx, routine);
    }

    function recomputeCompletedSeries(routine) {
        completedSeries = recomputeCompletedSeriesProgress(routine, completedRepGroups);
    }

    function ensureSessionSeriesOrder(routine) {
        sessionSeriesOrder = ensureSessionSeriesOrderProgress(routine, sessionSeriesOrder);
        return sessionSeriesOrder;
    }

    function pickTopMostIncomplete(routine) {
        const pick = pickTopMostIncompleteProgress(routine, sessionSeriesOrder, completedRepGroups);
        sessionSeriesOrder = pick.sessionSeriesOrder ?? sessionSeriesOrder;
        return pick.seriesIdx == null ? null : { seriesIdx: pick.seriesIdx, repIdx: pick.repIdx };
    }

    function advanceToNext(routine) {
        if (!routine) return;

        const next = advanceToNextProgress(routine, {
            completedRepGroups,
            currentSeriesIndex,
            currentRepGroupIndex,
            sessionSeriesOrder,
        });
        if (!next) return;

        currentSeriesIndex = next.currentSeriesIndex;
        currentRepGroupIndex = next.currentRepGroupIndex;
        sessionSeriesOrder = next.sessionSeriesOrder ?? sessionSeriesOrder;
    }

    // --- Session-only removal (exercise/set skipped today, routine unchanged) ---

    function isSeriesRemoved(seriesId) {
        return Boolean(seriesId) && removedSeriesIds.has(seriesId);
    }

    function isRepGroupRemoved(repGroupId) {
        return Boolean(repGroupId) && removedRepGroupIds.has(repGroupId);
    }

    function removeSeriesFromSession(seriesIdx) {
        const routine = getSessionRoutine();
        const s = routine?.series?.[seriesIdx];
        if (!s || isSeriesRemoved(s.id)) return;

        const msg = t("confirm.removeSeriesFromSession", { name: resolveExerciseName(s) })
            || `Remove "${resolveExerciseName(s)}" from today's session? The routine itself won't change.`;
        if (!confirm(msg)) return;

        // Curating the session is itself "starting" it: without this, a removal made
        // before pressing Start wouldn't persist (persistActiveSessionState requires
        // hasInitiated) and would be silently lost on reload.
        hasInitiated = true;
        syncSessionActionButtons();

        removedSeriesIds.add(s.id);
        (s.repGroups ?? []).forEach((rg, repIdx) => {
            removedRepGroupIds.add(rg.id);
            markRepDone(seriesIdx, repIdx);
        });

        expandedSeries.delete(seriesIdx);
        recomputeCompletedSeries(routine);

        if (currentSeriesIndex === seriesIdx) advanceToNext(routine);

        persistActiveSessionState();
        renderCurrent();
    }

    function removeRepGroupFromSession(seriesIdx, repIdx) {
        const routine = getSessionRoutine();
        const rg = routine?.series?.[seriesIdx]?.repGroups?.[repIdx];
        if (!rg || isRepGroupRemoved(rg.id)) return;

        const msg = t("confirm.removeSetFromSession");
        if (!confirm(msg)) return;

        hasInitiated = true;
        syncSessionActionButtons();

        removedRepGroupIds.add(rg.id);
        markRepDone(seriesIdx, repIdx);
        recomputeCompletedSeries(routine);

        if (currentSeriesIndex === seriesIdx && currentRepGroupIndex === repIdx) {
            advanceToNext(routine);
        }

        persistActiveSessionState();
        renderCurrent();
    }

    function renderExerciseOptions() {
        if (!addExerciseOptionsEl) return;

        const exercises = exerciseStore
            .list()
            .slice()
            .sort((a, b) => String(a.description).localeCompare(String(b.description)));

        addExerciseOptionsEl.innerHTML = exercises
            .map((ex) => `<option value="${escapeHtml(ex.description)}"></option>`)
            .join("");
    }

    function flashInvalidAddExerciseInput() {
        if (!addExerciseInput) return;
        addExerciseInput.focus();
        const prev = addExerciseInput.style.borderColor;
        addExerciseInput.style.borderColor = "rgba(248, 113, 113, 0.7)";
        setTimeout(() => {
            addExerciseInput.style.borderColor = prev;
        }, 700);
    }

    // Adds a brand-new exercise (with one empty set) to *this* session only. It
    // lives in `addedSeries`, is appended after the routine's own series wherever
    // getSessionRoutine() is used, and is never written to the stored Routine.
    function addExerciseToSession() {
        const persistedRoutine = getCurrentRoutine();
        if (!persistedRoutine) return;

        const typed = String(addExerciseInput?.value ?? "").trim();
        if (!typed) {
            flashInvalidAddExerciseInput();
            return;
        }

        const exercise = exerciseStore.getOrCreateByDescription(typed);

        const newSeries = new SetSeries({
            exerciseId: exercise.id,
            description: "",
            restSecondsAfter: 0,
            repGroups: [
                new RepGroup({
                    exerciseId: exercise.id,
                    laterality: Laterality.BILATERAL,
                    targetReps: null,
                    targetWeight: null,
                    restSecondsAfter: 0,
                    history: [],
                }),
            ],
        });

        // Adding to the session is itself "starting" it — same reasoning as removal,
        // so this persists and shows Finish/Stop even before the timer is started.
        hasInitiated = true;
        syncSessionActionButtons();

        addedSeries.push(newSeries);
        const newIndex = realSeriesCount(persistedRoutine) + addedSeries.length - 1;
        if (Array.isArray(sessionSeriesOrder)) sessionSeriesOrder.push(newIndex);

        currentSeriesIndex = newIndex;
        currentRepGroupIndex = 0;
        expandedSeries.add(newIndex);

        if (addExerciseInput) addExerciseInput.value = "";
        renderExerciseOptions();

        persistActiveSessionState();
        renderCurrent();
    }

    btnAddExercise?.addEventListener("click", () => addExerciseToSession());
    addExerciseInput?.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        addExerciseToSession();
    });

    function resolveExerciseName(seriesItem) {
        return resolveExerciseNameValue(seriesItem, exerciseStore, t("session.exercise.unknown"));
    }

    function formatSideValue(v) {
        return formatSideValueValue(v);
    }

    function resolveRepValue(repGroup, field) {
        return resolveRepValueValue(repGroup, field);
    }

    function renderCurrentExercise(routine) {
        if (!currentSectionEl) return;

        if (!hasInitiated) {
            currentSectionEl.style.display = "none";
            currentSectionEl.innerHTML = "";
            return;
        }

        const series = Array.isArray(routine?.series) ? routine.series : [];
        const s = series[currentSeriesIndex] || null;

        if (!s || isSeriesRemoved(s.id)) {
            currentSectionEl.style.display = "none";
            currentSectionEl.innerHTML = "";
            return;
        }

        const name = resolveExerciseName(s);
        const seriesDesc = s?.description != null ? String(s.description) : "";
        const descPlaceholder = t("session.seriesDesc.placeholder");
        const descDisplayText = seriesDesc || descPlaceholder;
        const descEmptyClass = seriesDesc ? "" : " currentSeriesDescText--empty";
        const descTextHtml = `<span class="currentSeriesDescText${descEmptyClass}" data-action="start-edit-desc">${escapeHtml(descDisplayText)}</span>`;
        const descTextareaHtml = `<textarea
                            class="currentSeriesDescInput"
                            data-action="edit-series-desc"
                            placeholder="${escapeHtml(descPlaceholder)}"
                            aria-label="${escapeHtml(t("session.seriesDesc.aria"))}"
                            spellcheck="true"
                            rows="1"
                            style="display:none"
                            >${escapeHtml(seriesDesc)}</textarea>`;

        const groups = Array.isArray(s?.repGroups) ? s.repGroups : [];
        let rg = groups[currentRepGroupIndex] || null;
        if (rg && isRepGroupRemoved(rg.id)) rg = null;

        const weightLabel = t("session.weight");
        const repsLabel = t("session.reps");

        let currentSetHtml = "";
        if (rg) {
            const weight = resolveRepValue(rg, "targetWeight");
            const reps = resolveRepValue(rg, "targetReps");
            const weightTxt = formatSideValue(weight);
            const repsTxt = formatSideValue(reps);

            const timerLabel = t("session.currentSet.timer");
            const hasStarted = startEpochMs != null;
            const canComplete = hasStarted && running && setRunning && !restRunning;
            const isDisabled = !canComplete;

            const btnLabel = !hasStarted
                ? t("session.currentSet.startToEnable")
                : (!running
                    ? t("session.currentSet.resumeToEnable")
                    : (restRunning
                        ? t("session.currentSet.restTimer")
                        : t("session.currentSet.complete")
                    )
                );

            currentSetHtml = `
                <div class="currentExerciseSubdivider"></div>

                <div class="currentSetRow">
                    <div class="currentSetTimer" aria-label="${escapeHtml(timerLabel)}">
                        <div class="currentSetTimerLabel">${escapeHtml(timerLabel)}</div>
                        <div class="currentSetTimerValue" id="currentSetTimerValue">00:00</div>

                        ${restRunning ? `
                            <button
                            type="button"
                            class="skipRestBtn"
                            data-action="skip-rest"
                            aria-label="${escapeHtml(t("session.rest.skip"))}"
                            >
                            ${escapeHtml(t("session.rest.skip"))}
                            </button>
                        ` : ""}
                    </div>

                    <div class="currentSetMetrics">
                    <div class="currentSetMetricsTop">
                        <span class="currentSetBadge">${escapeHtml(t("session.set"))} ${currentRepGroupIndex + 1}</span>
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

                 <div class="currentExerciseSubdivider"></div>

                <div
                  class="currentSetHistoryChartsMount"
                  data-mount="repgroup-history-charts"
                  style="margin-top:10px;"
                ></div>
            `;
        }

        // Removed sets stay in the real array (so add-set indices/history stay
        // correct) but are skipped here so they never render in the session UI.
        const visibleGroups = groups
            .map((rg2, repIdx) => ({ rg2, repIdx }))
            .filter(({ rg2 }) => !isRepGroupRemoved(rg2?.id));

        const flow = visibleGroups
            .map(({ rg2, repIdx }, visIdx) => {
                const st = statusForRep(currentSeriesIndex, repIdx);

                const weight = resolveRepValue(rg2, "targetWeight");
                const reps = resolveRepValue(rg2, "targetReps");
                const weightTxt = formatSideValue(weight);
                const repsTxt = formatSideValue(reps);

                const border =
                    st === "active"
                        ? "rgba(96, 165, 250, 0.55)"
                        : st === "done"
                            ? "rgba(34, 197, 94, 0.55)"
                            : "var(--border)";

                const bg =
                    st === "active"
                        ? "rgba(96, 165, 250, 0.10)"
                        : st === "done"
                            ? "rgba(34, 197, 94, 0.08)"
                            : "rgba(255, 255, 255, 0.02)";

                const addBefore = `
                    <button
                        type="button"
                        class="addSetBtn"
                        data-action="add-set"
                        data-insert-idx="${repIdx}"
                        aria-label="${escapeHtml(t("session.addSet"))}"
                        style="
                        min-width:44px;
                        height:64px;
                        border-radius:12px;
                        border:1px dashed var(--border);
                        background:transparent;
                        color:var(--muted);
                        font-size:22px;
                        font-weight:700;
                        cursor:pointer;
                        "
                    >
                        +
                    </button>
                    `;

                const square = `
                    <button
                        type="button"
                        data-action="focus-current-rep"
                        data-rep-idx="${repIdx}"
                        aria-label="${escapeHtml(t("session.set"))} ${repIdx + 1}"
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
                        <div style="font-size:12px; font-weight:800; line-height:1;">
                        ${repIdx + 1}
                        </div>
                        <div style="font-size:11px; line-height:1.15; text-align:left;">
                        <div>
                            <span class="muted">${escapeHtml(weightLabel)}:</span>
                            ${escapeHtml(weightTxt)}
                        </div>
                        <div>
                            <span class="muted">${escapeHtml(repsLabel)}:</span>
                            ${escapeHtml(repsTxt)}
                        </div>
                        </div>
                    </button>
                    `;

                const restSeconds =
                    typeof rg2?.restSecondsAfter === "number" ? rg2.restSecondsAfter : 0;

                const between =
                    visIdx < visibleGroups.length - 1
                        ? `
                        <div
                            aria-hidden="true"
                            style="
                            display:flex;
                            flex-direction:column;
                            align-items:center;
                            justify-content:center;
                            gap:6px;
                            min-width:44px;
                            "
                        >
                            <div style="font-size:18px; line-height:1; color: var(--muted);">
                            →
                            </div>
                            ${restSeconds > 0
                            ? `<div style="font-size:12px; color: var(--muted); font-weight:700; line-height:1;">${restSeconds}s</div>`
                            : `<div style="font-size:12px; color: var(--muted); opacity:0.65; font-weight:700; line-height:1;">—</div>`
                        }
                        </div>
                        `
                        : "";

                return addBefore + square + between;
            })
            .join("") +
            `
                <button
                type="button"
                class="addSetBtn"
                data-action="add-set"
                data-insert-idx="${groups.length}"
                aria-label="${escapeHtml(t("session.addSet"))}"
                style="
                    min-width:44px;
                    height:64px;
                    border-radius:12px;
                    border:1px dashed var(--border);
                    background:transparent;
                    color:var(--muted);
                    font-size:22px;
                    font-weight:700;
                    cursor:pointer;
                "
                >
                +
                </button>
            `;

        const allSetsLabel = escapeHtml(t("session.allSets"));

        currentSectionEl.style.display = "";
        currentSectionEl.innerHTML = `
            <div class="currentExerciseHeader">
                <div class="currentExerciseTitleWrap">
                <div class="currentExerciseLabel">${escapeHtml(t("session.currentExercise"))}</div>
                <div class="currentExerciseNameLine">
                    <span class="currentExerciseName">${escapeHtml(name)}</span> ${descTextHtml}
                </div>
                </div>

                <div class="currentExerciseIdx">
                ${escapeHtml(t("session.exercise"))} ${currentSeriesIndex + 1}/${series.length}
                </div>
            </div>
            ${descTextareaHtml}

            ${currentSetHtml}

            <div class="currentExerciseSubdivider"></div>

            <div class="allSetsLabel">${allSetsLabel}</div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                ${flow || `<span class="muted">${escapeHtml(t("session.noSets"))}</span>`}
            </div>
        `;

        cleanupCharts?.();
        cleanupCharts = null;
        const chartsMountEl = currentSectionEl.querySelector('[data-mount="repgroup-history-charts"]');
        if (chartsMountEl && rg) {
            cleanupCharts = mountRepGroupHistoryCharts(chartsMountEl, rg, { t }) || null;
        }

        syncDescInputOriginalValue();
        syncCurrentSetControls();
    }

    function syncCurrentSetControls() {
        if (!hasInitiated) return;
        const btn = currentSectionEl?.querySelector('[data-action="complete-current-set"]');
        if (!btn) return;

        const hasStarted = startEpochMs != null;
        const canComplete = hasStarted && running && setRunning && !restRunning;

        btn.disabled = !canComplete;

        const label = !hasStarted
            ? t("session.currentSet.startToEnable")
            : (!running
                ? t("session.currentSet.resumeToEnable")
                : (restRunning
                    ? t("session.currentSet.restTimer")
                    : t("session.currentSet.complete")
                )
            );

        btn.title = label;
        btn.setAttribute("aria-label", label);
    }

    function persistRepGroupTargets(rg, { reps, weight, restSecondsAfterOverride = null }) {
        if (!rg) return;

        if (reps !== undefined) {
            rg.targetReps = normalizeReps(reps);
        }

        if (weight !== undefined) {
            rg.targetWeight = normalizeWeight(weight);
        }

        if (typeof restSecondsAfterOverride === "number" && Number.isFinite(restSecondsAfterOverride)) {
            rg.restSecondsAfter = restSecondsAfterOverride;
        }
    }

    function commitCurrentSet({
        reps,
        weight,
        restSecondsAfterOverride = null,
        saveHistory = true,
        updateRepGroupFields = false,
    }) {
        const persistedRoutine = getCurrentRoutine();
        if (!persistedRoutine) return;

        const addedIdx = isAddedSeriesIndex(persistedRoutine, currentSeriesIndex);
        const s = addedIdx
            ? getAddedSeriesByIndex(persistedRoutine, currentSeriesIndex)
            : persistedRoutine.series?.[currentSeriesIndex];
        if (!s) return;

        const rg = s.repGroups?.[currentRepGroupIndex];
        if (!rg) return;

        const isLastRepGroup = currentRepGroupIndex >= (s.repGroups?.length ?? 0) - 1;

        if (updateRepGroupFields) {
            persistRepGroupTargets(rg, { reps, weight, restSecondsAfterOverride });

            if (
                isLastRepGroup &&
                typeof restSecondsAfterOverride === "number" &&
                Number.isFinite(restSecondsAfterOverride)
            ) {
                s.restSecondsAfter = restSecondsAfterOverride;
            }
        }

        if (saveHistory) {
            rg.upsertHistory(new Date().toISOString(), {
                reps,
                weight,
            });
        }

        // Added exercises are session-only: their history lives in memory + the
        // resumable snapshot, never in the stored Routine.
        if (!addedIdx) routineStore.update(persistedRoutine);
        upsertWorkoutSessionSnapshot({ finalize: false });

        const routine = getSessionRoutine();

        const isLast = currentRepGroupIndex >= s.repGroups.length - 1;
        const restToRun = isLast
            ? (typeof s.restSecondsAfter === "number" ? s.restSecondsAfter : 0)
            : (typeof rg.restSecondsAfter === "number" ? rg.restSecondsAfter : 0);

        markRepDone(currentSeriesIndex, currentRepGroupIndex);
        recomputeCompletedSeries(routine);

        if (isWorkoutComplete(routine)) {
            endWorkoutSession();
            return;
        }

        advanceToNext(routine);
        persistActiveSessionState();

        resetSetTimer();
        startRest(restToRun);
        renderCurrent();
    }

    function handleQuickCompleteFromNotification() {
        if (!hasInitiated) return;
        if (!running) return;
        if (restRunning) return;
        if (!setRunning) return;

        const routine = getSessionRoutine();
        if (!routine) return;

        const s = routine.series?.[currentSeriesIndex];
        const rg = s?.repGroups?.[currentRepGroupIndex];
        if (!rg) return;

        const latest = rg.getLatestHistory?.();

        const reps =
            latest?.reps ??
            rg.targetReps ??
            null;

        const weight =
            latest?.weight ??
            rg.targetWeight ??
            null;

        commitCurrentSet({
            reps,
            weight,
            saveHistory: true,
            updateRepGroupFields: false,
        });
    }

    currentSectionEl?.addEventListener("click", async (e) => {
        const persistedRoutine = getCurrentRoutine();
        if (!persistedRoutine) return;

        const addedIdx = isAddedSeriesIndex(persistedRoutine, currentSeriesIndex);
        const s = addedIdx
            ? getAddedSeriesByIndex(persistedRoutine, currentSeriesIndex)
            : persistedRoutine.series?.[currentSeriesIndex];
        if (!s) return;

        const skipRestBtn = e.target.closest('[data-action="skip-rest"]');
        if (skipRestBtn && restRunning) {
            endRestAndResumeSet({ resetSet: true });
            return;
        }

        const addBtn = e.target.closest('[data-action="add-set"]');
        if (addBtn) {
            const insertIdx = Number(addBtn.dataset.insertIdx);
            if (!Number.isInteger(insertIdx)) return;

            const groups = s.repGroups ?? [];

            const ref =
                groups[insertIdx - 1] ??
                groups[insertIdx] ??
                null;

            const baseReps =
                ref?.getLatestHistory?.()?.reps ??
                ref?.targetReps ??
                null;

            const baseWeight =
                ref?.getLatestHistory?.()?.weight ??
                ref?.targetWeight ??
                null;

            const performed = await openSessionSetModal({
                exerciseName: resolveExerciseName(s),
                setIndex: insertIdx + 1,
                laterality: ref?.laterality ?? Laterality.BILATERAL,
                initialReps: baseReps,
                initialWeight: baseWeight,
                initialRestSeconds: ref?.restSecondsAfter ?? 0,
                mode: "create",
            });

            if (!performed) return;

            const newRepGroup = new RepGroup({
                exerciseId: s.exerciseId,
                laterality: performed.laterality ?? ref?.laterality ?? Laterality.BILATERAL,
                targetReps: performed.reps,
                targetWeight: performed.weight,
                restSecondsAfter: performed.restSecondsAfter ?? 0,
                history: [],
            });

            s.repGroups.splice(insertIdx, 0, newRepGroup);

            shiftCompletedAfterInsert(currentSeriesIndex, insertIdx);

            if (addedIdx) persistActiveSessionState();
            else routineStore.update(persistedRoutine);

            if (insertIdx <= currentRepGroupIndex) {
                currentRepGroupIndex = insertIdx;
            }
            renderCurrent();
            return;
        }

        const completeBtn = e.target.closest('[data-action="complete-current-set"]');
        if (!completeBtn) return;
        if (!running || startEpochMs == null || restRunning || !setRunning) return;

        const rg = s?.repGroups?.[currentRepGroupIndex];
        if (!s || !rg) return;
        if (isRepDone(currentSeriesIndex, currentRepGroupIndex)) return;

        const latest = rg.getLatestHistory?.();
        const baseReps = latest?.reps ?? rg.targetReps;
        const baseWeight = latest?.weight ?? rg.targetWeight;

        const performed = await openSessionSetModal({
            exerciseName: resolveExerciseName(s),
            setIndex: currentRepGroupIndex + 1,
            laterality: rg.laterality,
            initialReps: baseReps,
            initialWeight: baseWeight,
            initialRestSeconds: rg.restSecondsAfter ?? 0,
        });

        if (!performed) return;

        // Update laterality on the repGroup if the user changed it
        if (performed.laterality && performed.laterality !== rg.laterality) {
            rg.laterality = performed.laterality;
        }

        commitCurrentSet({
            reps: performed.reps,
            weight: performed.weight,
            restSecondsAfterOverride: performed.restSecondsAfter ?? null,
            saveHistory: true,
            updateRepGroupFields: performed.changed === true,
        });
    });

    function renderRepGroupList(seriesIdx, s) {
        const groups = Array.isArray(s?.repGroups) ? s.repGroups : [];
        if (!groups.length) return "";

        const weightLabel = t("session.weight");
        const repsLabel = t("session.reps");
        const removeSetLabel = t("session.removeSet");

        const itemsHtml = groups
            .map((rg, repIdx) => {
                if (isRepGroupRemoved(rg?.id)) return "";

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
                  <button
                    type="button"
                    class="removeFromSessionBtn"
                    data-action="remove-rep-group"
                    data-series-idx="${seriesIdx}"
                    data-rep-idx="${repIdx}"
                    title="${escapeHtml(removeSetLabel)}"
                    aria-label="${escapeHtml(removeSetLabel)}"
                  >✕</button>
                  <span class="seriesStatus" aria-hidden="true">${icon}</span>
                </div>
              </div>
            `;
            })
            .join("");

        return `
      <div class="repGroupList" role="list">
        ${itemsHtml || `<p class="muted" style="margin:6px 0 0;">${escapeHtml(t("session.noSets"))}</p>`}
      </div>
    `;
    }

    listEl.addEventListener("click", (e) => {
        // Checked first: these buttons live inside .seriesItem/.repGroupItem, so
        // the generic row handlers below would otherwise also fire on this click.
        const removeSeriesBtn = e.target.closest('[data-action="remove-series"]');
        if (removeSeriesBtn) {
            const sIdx = Number(removeSeriesBtn.dataset.seriesIdx);
            if (Number.isFinite(sIdx)) removeSeriesFromSession(sIdx);
            return;
        }

        const removeRepGroupBtn = e.target.closest('[data-action="remove-rep-group"]');
        if (removeRepGroupBtn) {
            const sIdx = Number(removeRepGroupBtn.dataset.seriesIdx);
            const rIdx = Number(removeRepGroupBtn.dataset.repIdx);
            if (Number.isFinite(sIdx) && Number.isFinite(rIdx)) removeRepGroupFromSession(sIdx, rIdx);
            return;
        }

        const repItem = e.target.closest(".repGroupItem");
        const seriesItem = e.target.closest(".seriesItem");

        if (seriesItem) {
            const sIdx = Number(seriesItem.dataset.seriesIdx);
            if (Number.isFinite(sIdx)) {
                if (expandedSeries.has(sIdx)) expandedSeries.delete(sIdx);
                else expandedSeries.add(sIdx);
                renderCurrent();
                return;
            }
        }

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

        if (repItem) return;
        if (seriesItem) return;
    });

    function reorderSeriesAndSave(fromIdx, toIdx) {
        const routine = getSessionRoutine();
        if (!routine) return;

        ensureSessionSeriesOrder(routine);

        const n = sessionSeriesOrder.length;
        if (
            !Number.isInteger(fromIdx) || !Number.isInteger(toIdx) ||
            fromIdx < 0 || toIdx < 0 || fromIdx >= n || toIdx >= n
        ) return;

        moveItem(sessionSeriesOrder, fromIdx, toIdx);

        const currentHasProgress =
            currentSeriesIndex != null &&
            hasCompletedAnyRep(currentSeriesIndex);

        if (!currentHasProgress) {
            recomputeCompletedSeries(routine);
            const pick = pickTopMostIncomplete(routine);
            if (pick) {
                currentSeriesIndex = pick.seriesIdx;
                currentRepGroupIndex = pick.repIdx;
            } else {
                currentSeriesIndex = sessionSeriesOrder[0] ?? 0;
                currentRepGroupIndex = 0;
            }
        }

        renderSeriesList(routine);
    }

    attachDragReorder(listEl, {
        rowSelector: '.seriesBlock[data-index]',
        onReorder: (fromIdx, toIdx) => reorderSeriesAndSave(fromIdx, toIdx),
    });

    function renderSeriesList(routine) {
        const series = Array.isArray(routine?.series) ? routine.series : [];
        ensureSessionSeriesOrder(routine);

        emptyEl.style.display = series.length ? "none" : "";
        listEl.innerHTML = "";
        if (!series.length) return;

        recomputeCompletedSeries(routine);

        renderCurrentExercise(routine);

        listEl.innerHTML = sessionSeriesOrder
            .map((origIdx, displayIdx) => {
                const s = series[origIdx];
                const idx = origIdx;

                // Removed for this session only: keep its slot in sessionSeriesOrder
                // (so drag-reorder indices stay valid) but render nothing for it.
                if (isSeriesRemoved(s?.id)) return "";

                const name = resolveExerciseName(s);
                const desc = s.description
                    ? ` — <span class="muted">${escapeHtml(s.description)}</span>`
                    : "";

                const visibleRepCount = (Array.isArray(s?.repGroups) ? s.repGroups : [])
                    .filter((g) => !isRepGroupRemoved(g?.id)).length;
                const countChip = visibleRepCount > 0
                    ? `<span class="chip">${visibleRepCount} ${escapeHtml(t("session.sets"))}</span>`
                    : "";

                const seriesRestAfter =
                    typeof s.restSecondsAfter === "number" && s.restSecondsAfter > 0
                        ? `<span class="chip" style="margin-left:8px;">${escapeHtml(
                            t("session.rest")
                        )} ${s.restSecondsAfter}s</span>`
                        : "";

                const status = statusForSeries(idx, routine);
                const statusIcon = status === "done" ? "✓" : status === "active" ? "▶" : "•";

                const isExpanded = expandedSeries.has(idx);

                const removeSeriesLabel = t("session.removeSeries");

                return `
        <div class="seriesBlock" data-index="${displayIdx}" data-series-idx="${idx}" draggable="true" style="cursor:grab;">
          <div class="seriesItem seriesItem--${status}" data-series-idx="${idx}">
            <div class="seriesItemMeta">
              <h4>${idx + 1}. ${escapeHtml(name)}${desc}</h4>
              <p style="margin-top:8px;">${countChip}${seriesRestAfter}</p>
            </div>

            <div class="seriesItemActions">
              <button
                type="button"
                class="removeFromSessionBtn"
                data-action="remove-series"
                data-series-idx="${idx}"
                title="${escapeHtml(removeSeriesLabel)}"
                aria-label="${escapeHtml(removeSeriesLabel)}"
              >✕</button>
              <span class="seriesStatus" aria-hidden="true">${statusIcon}</span>
            </div>
          </div>

          <div class="seriesSublist ${isExpanded ? "" : "is-collapsed"}">
            ${isExpanded ? renderRepGroupList(idx, s) : ""}
          </div>
        </div>
      `;
            })
            .join("");

        requestAnimationFrame(() => {
            const active =
                listEl.querySelector(".repGroupItem--active") ||
                listEl.querySelector('.seriesBlock[data-series-idx="' + currentSeriesIndex + '"]') ||
                listEl.querySelector('.seriesItem[data-series-idx="' + currentSeriesIndex + '"]');
            active?.scrollIntoView?.({ block: "nearest" });
        });
    }

    function renderCurrent() {
        const routine = getSessionRoutine();
        if (!routine) return;
        renderSeriesList(routine);
    }

    return {
        render(params) {
            clearSessionNotification();
            resetTimer();
            resetRestTimer();
            resetSetTimer();
            hasInitiated = false;
            syncStartPauseLabel();

            const routineId = params?.routineId ?? null;
            currentRoutineId = routineId;
            currentSeriesIndex = 0;
            currentRepGroupIndex = 0;
            completedSeries = new Set();
            completedRepGroups = new Map();
            sessionSeriesOrder = null;
            activeWorkoutSessionId = null;
            sessionStartedAtIso = null;
            removedSeriesIds = new Set();
            removedRepGroupIds = new Set();
            addedSeries = [];

            expandedSeries = new Set();

            const routine = routineId ? routineStore.getById(routineId) : null;
            if (!routine) return;

            metaEl.textContent = routine.description || "—";

            const resumable = readResumableState(routineId);
            if (resumable) {
                const msg = t("confirm.resumeSession");
                if (confirm(msg)) {
                    restoreSessionState(resumable);
                } else {
                    clearActiveSessionState();
                }
            }

            // Combined view: empty addedSeries on a fresh start, restored ones after resume.
            const sessionRoutine = getSessionRoutine();

            if (!hasInitiated) {
                ensureSessionSeriesOrder(sessionRoutine);
                const pick = pickTopMostIncomplete(sessionRoutine);
                if (pick) {
                    currentSeriesIndex = pick.seriesIdx;
                    currentRepGroupIndex = pick.repIdx;
                }
            }

            expandedSeries.add(currentSeriesIndex);

            renderExerciseOptions();
            renderSeriesList(sessionRoutine);
        },
    };
}