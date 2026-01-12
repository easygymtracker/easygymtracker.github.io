// ui/components/routineListItem.js

import { escapeHtml } from "../dom.js";
import { t } from "/src/internationalization/i18n.js";

function seriesCountLabel(count) {
    if (count === 1) {
        return t("routines.exercisesCount.one", { count });
    }
    return t("routines.exercisesCount.other", { count });
}

export function routineListItem(routine) {
    const name = escapeHtml(routine.name || t("routines.untitled"));
    const desc = escapeHtml(routine.description || "");
    const seriesCount = Array.isArray(routine.series) ? routine.series.length : 0;

    const startSessionLabel = escapeHtml(t("routine.session.start") || "Start session");
    const startSessionHelp = escapeHtml(
        t("routine.session.startHelp") || "Start a session using this routine"
    );

    const downloadHelp = escapeHtml(
        t("routines.downloadHelp") || "Download this routine in a format you can import later"
    );

    return `
        <div class="routineRow withFloatingIcon" data-id="${routine.id}">
            <button
                class="startSessionBtn"
                type="button"
                data-action="start-session"
                title="${startSessionHelp}"
                aria-label="${startSessionHelp}"
            >
                <svg class="icon" width="22" height="22" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                    aria-hidden="true">
                    <polygon points="8 5 19 12 8 19 8 5"></polygon>
                </svg>
                <span class="srOnly">${startSessionLabel}</span>
            </button>

            <div class="routineRowBody">
                <div class="routineMeta">
                    <h3>${name}</h3>
                    <p>${desc || t("common.dash")}</p>
                </div>

                <div class="rowActions">
                    <span class="chip">${escapeHtml(seriesCountLabel(seriesCount))}</span>
                    <button class="btn primary" data-action="open">${escapeHtml(t("common.open"))}</button>
                    <button class="btn danger" data-action="delete">${escapeHtml(t("common.delete"))}</button>
                </div>
            </div>

            <button
                class="iconBtn routineRowDownloadBtn"
                type="button"
                data-action="download"
                aria-label="${downloadHelp}"
                title="${downloadHelp}"
            >
                <svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 3v12"></path>
                    <path d="M8 11l4 4 4-4"></path>
                    <path d="M5 21h14"></path>
                </svg>
            </button>
        </div>
    `;
}