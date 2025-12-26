import { escapeHtml } from "../dom.js";

export function routineListItem(routine) {
    const name = escapeHtml(routine.name || "Untitled routine");
    const desc = escapeHtml(routine.description || "");
    const seriesCount = Array.isArray(routine.series) ? routine.series.length : 0;

    return `
    <div class="routineRow" data-id="${routine.id}">
      <div class="routineMeta">
        <h3>${name}</h3>
        <p>${desc || "—"}</p>
      </div>
      <div class="rowActions">
        <span class="chip">${seriesCount} series</span>
        <button class="btn primary" data-action="open">Open</button>
        <button class="btn danger" data-action="delete">Delete</button>
      </div>
    </div>
  `;
}