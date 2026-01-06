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