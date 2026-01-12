// src/pages/sessionPage.js

import { t } from "/src/internationalization/i18n.js";

import { escapeHtml } from "/src/ui/dom.js";
import { pad2, formatMs } from "/src/utils/numberFormat.js";


export function mountSessionPage({ routineStore, exerciseStore }) {
    const titleEl = document.getElementById("sessionTitle");
    const metaEl = document.getElementById("sessionRoutineMeta");

    const timerEl = document.getElementById("sessionTimer");
    const btnStartPause = document.getElementById("btnSessionStartPause");
    const btnReset = document.getElementById("btnSessionReset");

    const listEl = document.getElementById("sessionSeriesList");
    const emptyEl = document.getElementById("sessionEmpty");
    const notFoundEl = document.getElementById("sessionNotFound");

    // --- timer state ---
    let running = false;
    let startEpochMs = null;
    let elapsedMs = 0;
    let tickHandle = null;

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

    btnStartPause.addEventListener("click", () => {
        if (running) pauseTimer();
        else startTimer();
    });

    btnReset.addEventListener("click", () => {
        resetTimer();
        // also keep reset button title/aria consistent with current language
        const resetLabel = t("session.timer.reset");
        btnReset.title = resetLabel;
        btnReset.setAttribute("aria-label", resetLabel);
    });

    function resolveExerciseName(seriesItem) {
        const id = seriesItem?.exerciseId;
        if (!id) return t("session.exercise.unknown");

        const ex =
            (exerciseStore?.getById?.(id)) ||
            (exerciseStore?.list?.()?.find?.((e) => e.id === id)) ||
            null;

        return ex?.name || ex?.description || id;
    }

    function renderSeriesList(routine) {
        const series = Array.isArray(routine?.series) ? routine.series : [];

        emptyEl.style.display = series.length ? "none" : "";
        listEl.innerHTML = "";

        if (!series.length) return;

        listEl.innerHTML = series.map((s, idx) => {
            const name = resolveExerciseName(s);
            const desc = s.description ? ` — <span class="muted">${escapeHtml(s.description)}</span>` : "";

            const setCount = Array.isArray(s.repGroups) ? s.repGroups.length : 0;

            const restAfter = (typeof s.restSecondsAfter === "number" && s.restSecondsAfter > 0)
                ? `<span class="chip" style="margin-left:8px;">${escapeHtml(t("session.rest"))} ${s.restSecondsAfter}s</span>`
                : "";

            return `
        <div class="routineRow" style="grid-template-columns: 1fr; padding: 12px 10px;">
          <div class="routineMeta">
            <h3 style="margin:0; font-size:14px;">
              ${idx + 1}. ${escapeHtml(name)}${desc}
            </h3>
            <p style="margin:6px 0 0;">
              ${setCount} ${escapeHtml(setCount === 1 ? t("session.set") : t("session.sets"))}
              ${restAfter}
            </p>
          </div>
        </div>
      `;
        }).join("");
    }

    return {
        render(params) {
            // reset state when entering / switching routines
            resetTimer();

            // reset reset button label (in case locale changed)
            const resetLabel = t("session.timer.reset");
            btnReset.textContent = resetLabel;
            btnReset.title = resetLabel;
            btnReset.setAttribute("aria-label", resetLabel);

            notFoundEl.style.display = "none";

            const routineId = params?.routineId;
            const routine = routineId ? routineStore.getById(routineId) : null;

            if (!routine) {
                metaEl.textContent = "—";
                listEl.innerHTML = "";
                emptyEl.style.display = "none";
                notFoundEl.style.display = "";
                return;
            }

            // Title is translated by translateDocument(); keep it stable.
            // Routine description is user content, not translated.
            metaEl.textContent = routine.description ? routine.description : "—";

            renderSeriesList(routine);
        },
    };
}