// ui/components/routineListItem.js

import { escapeHtml } from "../dom.js";
import { t } from "../../internationalization/i18n.js";

function seriesCountLabel(count) {
    if (count === 1) {
        return t("routines.seriesCount.one", { count });
    }
    return t("routines.seriesCount.other", { count });
}

export function routineListItem(routine) {
    const name = escapeHtml(routine.name || t("routines.untitled"));
    const desc = escapeHtml(routine.description || "");
    const seriesCount = Array.isArray(routine.series) ? routine.series.length : 0;

    return `
        <div class="routineRow" data-id="${routine.id}">
            <button
                class="iconBtn"
                type="button"
                data-action="download"
                aria-label="${escapeHtml(
                    t("routines.downloadHelp") ||
                    "Download this routine in a format you can import later"
                )}"
                title="${escapeHtml(
                    t("routines.downloadHelp") ||
                    "Download this routine in a format you can import later"
                )}"
            >
                <svg
                    class="icon"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                >
                    <path d="M12 3v12"></path>
                    <path d="M8 11l4 4 4-4"></path>
                    <path d="M5 21h14"></path>
                </svg>
            </button>

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
    `;
}