// src/ui/components/repGroupHistoryCharts.js
import { escapeHtml } from "/src/ui/dom.js";
import {
    clamp,
    getDefaultViewportState,
    getPoints,
    getPointsBySide,
    getRepGroupTimeline,
} from "/src/ui/components/repGroupHistory/data.js";
import { drawMultiLineChart } from "/src/ui/components/repGroupHistory/render.js";

const DRAG_THRESHOLD_PX = 8;
const DOUBLE_TAP_MS = 320;

function skeletonHtml({ weightTitle, repsTitle, isUnilateral, leftLabel, rightLabel }) {
    const legend = isUnilateral
        ? `
        <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
          <span class="chip" style="display:inline-flex; align-items:center; gap:6px;">
            <span aria-hidden="true" style="display:inline-block; width:10px; height:10px; border-radius:999px; background: var(--text);"></span>
            ${escapeHtml(leftLabel)}
          </span>
          <span class="chip" style="display:inline-flex; align-items:center; gap:6px;">
            <span aria-hidden="true" style="display:inline-block; width:10px; height:10px; border-radius:999px; background: rgba(34, 197, 94, 0.95);"></span>
            ${escapeHtml(rightLabel)}
          </span>
        </div>
      `
        : "";

    return `
    <div class="repGroupHistoryCharts" style="display:grid; gap:10px;">
      <div style="border:1px solid var(--border); border-radius:12px; padding:10px;">
        ${legend}
        <canvas data-chart="weight" aria-label="${escapeHtml(weightTitle)}"
                    style="width:100%; height:120px; display:block; touch-action:pan-y; cursor:grab;"></canvas>
      </div>

      <div style="border:1px solid var(--border); border-radius:12px; padding:10px;">
        ${legend}
        <canvas data-chart="reps" aria-label="${escapeHtml(repsTitle)}"
                    style="width:100%; height:120px; display:block; touch-action:pan-y; cursor:grab;"></canvas>
      </div>
    </div>
  `;
}

/**
 * Mount charts into containerEl (innerHTML replaced).
 * Returns cleanup() for observers.
 */
export function mountRepGroupHistoryCharts(containerEl, repGroup, { t } = {}) {
    if (!containerEl) return null;

    const weightTitle = t?.("session.history.weight") || "Weight over time";
    const repsTitle = t?.("session.history.reps") || "Reps over time";

    const isUnilateral = repGroup?.laterality === "unilateral";

    // Use your existing i18n keys (fallbacks included)
    const leftLabel =
        (t?.("repGroup.targetWeightLeftPlaceholder") || "Left").replace(/[:：]\s*$/, "");
    const rightLabel =
        (t?.("repGroup.targetWeightRightPlaceholder") || "Right").replace(/[:：]\s*$/, "");

    containerEl.innerHTML = skeletonHtml({
        weightTitle,
        repsTitle,
        isUnilateral,
        leftLabel,
        rightLabel,
    });

    const weightCanvas = containerEl.querySelector('canvas[data-chart="weight"]');
    const repsCanvas = containerEl.querySelector('canvas[data-chart="reps"]');
    const sharedTimeline = getRepGroupTimeline(repGroup);
    const chartState = {
        ...getDefaultViewportState(sharedTimeline),
        activePointerId: null,
        activeCanvas: null,
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0,
        dragStartIndex: 0,
        lastTapAt: 0,
    };
    const canvasLayouts = new WeakMap();

    const pickTimestamp = (canvas, clientX) => {
        const layout = canvasLayouts.get(canvas);
        if (!layout?.visibleTimeline?.length) return null;

        const rect = canvas.getBoundingClientRect();
        const relativeX = clamp(clientX - rect.left, 0, rect.width || 1);
        const normalized = clamp((relativeX - layout.padL) / Math.max(1, layout.plotW), 0, 1);
        const maxIndex = layout.visibleTimeline.length - 1;
        const index = Math.round(normalized * maxIndex);
        return layout.visibleTimeline[index] ?? null;
    };

    const resetViewport = () => {
        Object.assign(chartState, getDefaultViewportState(sharedTimeline), {
            activePointerId: null,
            activeCanvas: null,
            isDragging: false,
            dragStartX: 0,
            dragStartY: 0,
            dragStartIndex: 0,
        });
    };

    const render = () => {
        if (isUnilateral) {
            const w = getPointsBySide(repGroup, "weight");
            const r = getPointsBySide(repGroup, "reps");

            canvasLayouts.set(weightCanvas, drawMultiLineChart(weightCanvas, { left: w.left, right: w.right }, {
                title: weightTitle,
                interaction: { timeline: sharedTimeline, viewState: chartState, seriesLabels: { left: leftLabel, right: rightLabel } },
            }));
            canvasLayouts.set(repsCanvas, drawMultiLineChart(repsCanvas, { left: r.left, right: r.right }, {
                title: repsTitle,
                interaction: { timeline: sharedTimeline, viewState: chartState, seriesLabels: { left: leftLabel, right: rightLabel } },
            }));
        } else {
            canvasLayouts.set(weightCanvas, drawMultiLineChart(weightCanvas, { main: getPoints(repGroup, "weight") }, {
                title: weightTitle,
                interaction: { timeline: sharedTimeline, viewState: chartState, seriesLabels: { main: "" } },
            }));
            canvasLayouts.set(repsCanvas, drawMultiLineChart(repsCanvas, { main: getPoints(repGroup, "reps") }, {
                title: repsTitle,
                interaction: { timeline: sharedTimeline, viewState: chartState, seriesLabels: { main: "" } },
            }));
        }
    };

    const handlePointerDown = (event) => {
        const canvas = event.currentTarget;
        canvas.setPointerCapture?.(event.pointerId);
        chartState.activePointerId = event.pointerId;
        chartState.activeCanvas = canvas;
        chartState.isDragging = false;
        chartState.dragStartX = event.clientX;
        chartState.dragStartY = event.clientY;
        chartState.dragStartIndex = chartState.startIndex;
    };

    const handlePointerMove = (event) => {
        if (chartState.activePointerId !== event.pointerId || !chartState.activeCanvas) return;

        const canvas = chartState.activeCanvas;
        const layout = canvasLayouts.get(canvas);
        if (!layout?.visibleTimeline?.length) return;

        const dx = event.clientX - chartState.dragStartX;
        const dy = event.clientY - chartState.dragStartY;

        if (!chartState.isDragging) {
            if (Math.abs(dx) < DRAG_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;
            chartState.isDragging = true;
        }

        event.preventDefault();
        const pixelsPerStep = layout.visibleTimeline.length > 1
            ? layout.plotW / Math.max(1, chartState.windowSize - 1)
            : layout.plotW;
        const nextStart = chartState.dragStartIndex - Math.round(dx / Math.max(18, pixelsPerStep));
        const maxStart = Math.max(0, sharedTimeline.length - chartState.windowSize);
        const clampedStart = clamp(nextStart, 0, maxStart);

        if (clampedStart !== chartState.startIndex) {
            chartState.startIndex = clampedStart;
            chartState.focusT = null;
            render();
        }
    };

    const handlePointerEnd = (event) => {
        if (chartState.activePointerId !== event.pointerId) return;

        const canvas = event.currentTarget;
        canvas.releasePointerCapture?.(event.pointerId);

        if (!chartState.isDragging) {
            const now = Date.now();
            if (now - chartState.lastTapAt <= DOUBLE_TAP_MS) {
                resetViewport();
            } else {
                chartState.focusT = pickTimestamp(canvas, event.clientX);
                chartState.lastTapAt = now;
            }
            render();
        }

        chartState.activePointerId = null;
        chartState.activeCanvas = null;
        chartState.isDragging = false;
    };

    render();

    weightCanvas?.addEventListener("pointerdown", handlePointerDown);
    repsCanvas?.addEventListener("pointerdown", handlePointerDown);
    weightCanvas?.addEventListener("pointermove", handlePointerMove);
    repsCanvas?.addEventListener("pointermove", handlePointerMove);
    weightCanvas?.addEventListener("pointerup", handlePointerEnd);
    repsCanvas?.addEventListener("pointerup", handlePointerEnd);
    weightCanvas?.addEventListener("pointercancel", handlePointerEnd);
    repsCanvas?.addEventListener("pointercancel", handlePointerEnd);

    const ro = new ResizeObserver(render);
    ro.observe(containerEl);

    return () => {
        ro.disconnect();
        weightCanvas?.removeEventListener("pointerdown", handlePointerDown);
        repsCanvas?.removeEventListener("pointerdown", handlePointerDown);
        weightCanvas?.removeEventListener("pointermove", handlePointerMove);
        repsCanvas?.removeEventListener("pointermove", handlePointerMove);
        weightCanvas?.removeEventListener("pointerup", handlePointerEnd);
        repsCanvas?.removeEventListener("pointerup", handlePointerEnd);
        weightCanvas?.removeEventListener("pointercancel", handlePointerEnd);
        repsCanvas?.removeEventListener("pointercancel", handlePointerEnd);
    };
}