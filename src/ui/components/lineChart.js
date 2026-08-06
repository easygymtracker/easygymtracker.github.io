// ui/components/lineChart.js
//
// The daily-max sparkline shared by the profile summary and the metric history
// page. It lived twice, copy-pasted, and the copies had already drifted: only
// one of them drew the start/end date labels. This keeps the richer version.

import { t } from "../../internationalization/i18n.js";
import { escapeHtml } from "../dom.js";

/**
 * @param {Array<{day: string, value: number}>} points Chronological.
 * @param {object} options
 * @param {string} options.color   Stroke/dot colour.
 * @param {string} [options.unit]  Appended to value labels, e.g. "kg".
 * @param {string} [options.ariaLabel]
 * @param {number} [options.width]
 * @param {number} [options.height]
 * @returns {string} SVG markup, or a note element when there is nothing to plot.
 */
export function lineChartSvg(points, { color, unit = "", ariaLabel = "", width = 320, height = 140 } = {}) {
    if (!points.length) {
        return `<div class="note">${escapeHtml(t("profileHistory.noDataYet"))}</div>`;
    }

    const padL = 30;
    const padR = 12;
    const padT = 12;
    const padB = 24;

    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    // A flat series would divide by zero; 1 keeps it centred instead.
    const range = max - min || 1;

    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const coords = points.map((point, index) => ({
        ...point,
        // A lone point sits mid-plot rather than pinned to the left edge.
        x: padL + (plotW * (points.length === 1 ? 0.5 : index / (points.length - 1))),
        y: padT + (plotH * (1 - ((point.value - min) / range))),
    }));

    const polyline = coords.map((point) => `${point.x},${point.y}`).join(" ");
    const dots = coords.map((point) => `
        <circle cx="${point.x}" cy="${point.y}" r="3.5" fill="${color}">
          <title>${escapeHtml(point.day)}: ${escapeHtml(String(point.value))}${escapeHtml(unit)}</title>
        </circle>
    `).join("");

    // Day keys are ISO, so slice(5) drops the year and leaves "MM-DD".
    const startLabel = escapeHtml(coords[0].day.slice(5));
    const endLabel = escapeHtml(coords[coords.length - 1].day.slice(5));

    return `
    <svg class="lineChart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(ariaLabel)}">
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${height - padB}" stroke="var(--border)" />
        <line x1="${padL}" y1="${height - padB}" x2="${width - padR}" y2="${height - padB}" stroke="var(--border)" />
        <text x="${padL}" y="${padT - 2}" fill="var(--muted)" font-size="10">${escapeHtml(String(max))}${escapeHtml(unit)}</text>
        <text x="${padL}" y="${height - padB + 14}" fill="var(--muted)" font-size="10">${startLabel}</text>
        <text x="${width - padR}" y="${height - padB + 14}" text-anchor="end" fill="var(--muted)" font-size="10">${endLabel}</text>
        <polyline fill="none" stroke="${color}" stroke-width="2.5" points="${polyline}" />
        ${dots}
      </svg>
    `;
}
