// src/pages/sessionPage.js

import { t } from "/src/internationalization/i18n.js";

import { escapeHtml } from "/src/ui/dom.js";
import { formatMs } from "/src/utils/numberFormat.js";


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

    // --- session progress state (series status) ---
    let currentRoutineId = null;
    let currentSeriesIndex = 0; // "in progress"
    let completedSeries = new Set(); // indices marked completed

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
        const resetLabel = t("session.timer.reset");
        btnReset.title = resetLabel;
        btnReset.setAttribute("aria-label", resetLabel);
    });

    listEl.addEventListener("click", (e) => {
        const item = e.target.closest(".seriesItem");
        if (!item) return;

        const idx = Number(item.dataset.seriesIdx);
        if (!Number.isFinite(idx)) return;

        const completeBtn = e.target.closest('[data-action="complete-series"]');
        if (completeBtn) {
            completedSeries.add(idx);

            const routine = currentRoutineId ? routineStore.getById(currentRoutineId) : null;
            const max = routine?.series?.length ?? 0;

            let next = idx + 1;
            while (next < max && completedSeries.has(next)) next += 1;

            if (next < max) {
                currentSeriesIndex = next;
            }

            renderCurrent();
            return;
        }

        currentSeriesIndex = idx;
        renderCurrent();
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

    function statusForIndex(idx) {
        if (completedSeries.has(idx)) return "done";
        if (idx === currentSeriesIndex) return "active";
        return "todo";
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

            const status = statusForIndex(idx);

            const statusIcon = status === "done" ? "✓" : status === "active" ? "▶" : "•";

            return `
                <div class="seriesItem seriesItem--${status}" data-series-idx="${idx}">
                    <div class="seriesItemMeta">
                        <h4>${idx + 1}. ${escapeHtml(name)}${desc}</h4>
                        <p>
                            ${setCount} ${escapeHtml(setCount === 1 ? t("session.set") : t("session.sets"))}
                            ${restAfter}
                        </p>
                    </div>

                    <div class="seriesItemActions">
                        <span class="seriesStatus" aria-hidden="true">${statusIcon}</span>
                    ` +
                     //   <button class="seriesMiniBtn done" type="button" data-action="complete-series" aria-label="✓" title="✓">✓</button>
                     + `
                     </div>
                </div>
            `;
        }).join("");

        requestAnimationFrame(() => {
            const active = listEl.querySelector(".seriesItem--active");
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

            const resetLabel = t("session.timer.reset");
            btnReset.textContent = resetLabel;
            btnReset.title = resetLabel;
            btnReset.setAttribute("aria-label", resetLabel);

            syncStartPauseLabel();

            notFoundEl.style.display = "none";

            const routineId = params?.routineId ?? null;
            currentRoutineId = routineId;

            currentSeriesIndex = 0;
            completedSeries = new Set();

            const routine = routineId ? routineStore.getById(routineId) : null;

            if (!routine) {
                metaEl.textContent = "—";
                listEl.innerHTML = "";
                emptyEl.style.display = "none";
                notFoundEl.style.display = "";
                return;
            }

            metaEl.textContent = routine.description ? routine.description : "—";

            renderSeriesList(routine);
        },
    };
}