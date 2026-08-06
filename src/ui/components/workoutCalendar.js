import { t } from "/src/internationalization/i18n.js";
import { escapeHtml } from "../dom.js";
import { formatDate, formatMonthYear, formatTime, toDayKey, weekdayLabels } from "/src/ui/format.js";
import { formatMs } from "/src/utils/numberFormat.js";

// The calendar wants its own empty-state wording rather than a bare dash.
const formatCalendarDay = (dayKey) =>
    dayKey ? formatDate(dayKey, dayKey) : t("workoutCalendar.noDaySelected");

function monthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(date, delta) {
    return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function pad2(n) {
    return String(n).padStart(2, "0");
}

function dayKeyFromParts(year, month0, day) {
    return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}




function aggregateDay(sessions) {
    const stats = {
        count: sessions.length,
        sets: 0,
        reps: 0,
        volume: 0,
        durationMs: 0,
        prs: 0,
    };

    for (const session of sessions) {
        stats.sets += Number(session?.totals?.sets ?? 0) || 0;
        stats.reps += Number(session?.totals?.reps ?? 0) || 0;
        stats.volume += Number(session?.totals?.volume ?? 0) || 0;
        stats.durationMs += Number(session?.durationMs ?? 0) || 0;
        stats.prs += Number(session?.prDetection?.totalPrs ?? 0) || 0;
    }

    return stats;
}

function sessionsByDay(sessions) {
    const map = new Map();
    for (const session of sessions) {
        const key = toDayKey(session?.endedAt || session?.date || session?.startedAt);
        if (!key) continue;
        const arr = map.get(key) || [];
        arr.push(session);
        map.set(key, arr);
    }
    return map;
}


function formatVolume(volume) {
    const v = Number(volume);
    if (!Number.isFinite(v)) return t("common.dash");
    return `${Math.round(v)} kg`;
}

function aggregateMonth(byDay, viewDate) {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();

    const stats = { sessions: 0, sets: 0, reps: 0, volume: 0, prs: 0 };

    for (const [dayKey, sessions] of byDay.entries()) {
        const d = new Date(dayKey);
        if (Number.isNaN(d.getTime()) || d.getFullYear() !== y || d.getMonth() !== m) continue;

        const dayStats = aggregateDay(sessions);
        stats.sessions += dayStats.count;
        stats.sets += dayStats.sets;
        stats.reps += dayStats.reps;
        stats.volume += dayStats.volume;
        stats.prs += dayStats.prs;
    }

    return stats;
}

export function mountWorkoutCalendar({
    container,
    workoutSessionStore,
    titleKey = "workoutCalendar.title",
    mode = "rich",
}) {
    if (!container) {
        return { render() {} };
    }

    const isCompact = mode === "compact";
    let viewDate = monthStart(new Date());
    let selectedDayKey = toDayKey(new Date().toISOString());

    function pickFallbackSelectedKey(byDay) {
        if (selectedDayKey && byDay.has(selectedDayKey)) return selectedDayKey;

        const y = viewDate.getFullYear();
        const m = viewDate.getMonth();
        const keysInMonth = Array.from(byDay.keys())
            .filter((key) => {
                const d = new Date(key);
                return d.getFullYear() === y && d.getMonth() === m;
            })
            .sort((a, b) => a.localeCompare(b));

        if (keysInMonth.length) return keysInMonth[0];
        return "";
    }

    function render() {
        const sessions = workoutSessionStore?.listSessions?.() ?? [];
        const byDay = sessionsByDay(sessions);
        const monthStats = aggregateMonth(byDay, viewDate);

        selectedDayKey = pickFallbackSelectedKey(byDay);

        const year = viewDate.getFullYear();
        const month0 = viewDate.getMonth();
        const firstWeekday = new Date(year, month0, 1).getDay();
        const daysInMonth = new Date(year, month0 + 1, 0).getDate();

        const weekLabels = weekdayLabels();
        const leading = Array.from({ length: firstWeekday }, () => "<div class=\"workoutCalendarCell workoutCalendarCell--ghost\"></div>");

        const dayCells = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const key = dayKeyFromParts(year, month0, day);
            const daySessions = byDay.get(key) || [];
            const stats = aggregateDay(daySessions);
            const isSelected = selectedDayKey === key;
            const hasWorkouts = daySessions.length > 0;

            const summary = hasWorkouts
                ? t("workoutCalendar.daySummary", { count: String(stats.count), sets: String(stats.sets) })
                : t("workoutCalendar.noWorkoutsThisDay");
            const dayLabel = formatCalendarDay(key);

            dayCells.push(`
                <button type="button"
                        class="workoutCalendarCell workoutCalendarDay${hasWorkouts ? " workoutCalendarDay--has" : ""}${isSelected ? " workoutCalendarDay--selected" : ""}"
                        data-day="${key}"
                        aria-label="${escapeHtml(`${dayLabel} - ${summary}`)}">
                    <span class="workoutCalendarDayNum">${day}</span>
                    <span class="workoutCalendarDayMeta">${hasWorkouts ? escapeHtml(t("workoutCalendar.sessionsShort", { count: String(stats.count) })) : ""}</span>
                </button>
            `);
        }

        const selectedSessions = selectedDayKey ? (byDay.get(selectedDayKey) || []) : [];
        const selectedStats = aggregateDay(selectedSessions);

        const selectedSummary = selectedDayKey
            ? t("workoutCalendar.dayTotals", {
                sessions: String(selectedStats.count),
                sets: String(selectedStats.sets),
                reps: String(selectedStats.reps),
            })
            : t("workoutCalendar.noDaySelected");

        const details = selectedSessions.length
            ? selectedSessions.map((session) => {
                const routineName = escapeHtml(session?.routineName || t("workoutCalendar.untitledRoutine"));
                const startedAt = formatTime(session?.startedAt || session?.date);
                const duration = formatMs(Number(session?.durationMs ?? 0) || 0);
                const sets = Number(session?.totals?.sets ?? 0) || 0;
                const reps = Number(session?.totals?.reps ?? 0) || 0;
                const volume = formatVolume(session?.totals?.volume);
                const prs = Number(session?.prDetection?.totalPrs ?? 0) || 0;
                const status = session?.isCompleted
                    ? t("workoutCalendar.sessionStatus.completed")
                    : t("workoutCalendar.sessionStatus.inProgress");

                return `
                    <article class="workoutCalendarSessionCard">
                        <div class="workoutCalendarSessionHead">
                            <strong>${routineName}</strong>
                            <span class="note">${escapeHtml(startedAt)} · ${escapeHtml(status)}</span>
                        </div>
                        <div class="workoutCalendarSessionStats note">
                            ${escapeHtml(t("workoutCalendar.duration"))}: ${escapeHtml(duration)} ·
                            ${escapeHtml(t("workoutCalendar.sets"))}: ${sets} ·
                            ${escapeHtml(t("workoutCalendar.reps"))}: ${reps} ·
                            ${escapeHtml(t("workoutCalendar.volume"))}: ${escapeHtml(volume)} ·
                            ${escapeHtml(t("workoutCalendar.prs"))}: ${prs}
                        </div>
                    </article>
                `;
            }).join("")
            : `<p class="note" style="margin:0;">${escapeHtml(t("workoutCalendar.noWorkoutsDay"))}</p>`;

        container.innerHTML = `
            <section class="workoutCalendar" aria-label="${escapeHtml(t(titleKey))}">
                <header class="workoutCalendarHeader">
                    <h3>${escapeHtml(t(titleKey))}</h3>
                    <div class="workoutCalendarNav">
                        <button class="btn" type="button" data-action="prev-month" aria-label="${escapeHtml(t("workoutCalendar.prevMonth"))}">‹</button>
                        <strong class="workoutCalendarMonthLabel">${escapeHtml(formatMonthYear(viewDate))}</strong>
                        <button class="btn" type="button" data-action="next-month" aria-label="${escapeHtml(t("workoutCalendar.nextMonth"))}">›</button>
                    </div>
                </header>

                <div class="workoutCalendarMonthSummary note">
                    ${escapeHtml(t("workoutCalendar.monthTotals", {
                        sessions: String(monthStats.sessions),
                        sets: String(monthStats.sets),
                        reps: String(monthStats.reps),
                        prs: String(monthStats.prs),
                    }))}
                </div>

                <div class="workoutCalendarWeekdays">
                    ${weekLabels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
                </div>

                <div class="workoutCalendarGrid">
                    ${leading.join("")}
                    ${dayCells.join("")}
                </div>

                <div class="workoutCalendarDetails card${isCompact ? " workoutCalendarDetails--compact" : ""}">
                    <div class="workoutCalendarDetailsHeader">
                        <strong>${escapeHtml(formatCalendarDay(selectedDayKey))}</strong>
                        ${selectedDayKey ? `<span class="note">${escapeHtml(selectedSummary)}</span>` : ""}
                    </div>
                    ${isCompact
            ? `<div class="workoutCalendarCompactHint note">${escapeHtml(t("workoutCalendar.compactHint"))}</div>`
            : `<div class="workoutCalendarDetailsBody">${details}</div>`}
                </div>
            </section>
        `;
    }

    container.addEventListener("click", (event) => {
        const target = event.target.closest("[data-action], [data-day]");
        if (!target) return;

        if (target.matches("[data-action='prev-month']")) {
            viewDate = shiftMonth(viewDate, -1);
            render();
            return;
        }

        if (target.matches("[data-action='next-month']")) {
            viewDate = shiftMonth(viewDate, 1);
            render();
            return;
        }

        const day = target.getAttribute("data-day");
        if (day) {
            selectedDayKey = day;
            render();
        }
    });

    return { render };
}
