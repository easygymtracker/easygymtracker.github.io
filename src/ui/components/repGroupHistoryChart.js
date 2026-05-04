// src/ui/components/repGroupHistoryCharts.js
import { escapeHtml } from "/src/ui/dom.js";

const DEFAULT_WINDOW_POINTS = 10;
const DRAG_THRESHOLD_PX = 8;
const DOUBLE_TAP_MS = 320;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/**
 * Convert RepGroup history value (null | number | {left,right}) into a scalar number:
 * - number => number
 * - {left,right} => mean of available numeric sides (ignores null sides)
 * - null/invalid => null
 */
function toScalarLR(v) {
    if (v == null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;

    if (typeof v === "object") {
        const vals = [];
        if (typeof v.left === "number" && Number.isFinite(v.left)) vals.push(v.left);
        if (typeof v.right === "number" && Number.isFinite(v.right)) vals.push(v.right);
        if (!vals.length) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    return null;
}

function toSide(v, side /* "left" | "right" */) {
    if (v == null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v; // if stored as number, use same for both
    if (typeof v === "object") {
        const n = v?.[side];
        return (typeof n === "number" && Number.isFinite(n)) ? n : null;
    }
    return null;
}

function parseIsoMs(dateTime) {
    const ms = Date.parse(dateTime);
    return Number.isFinite(ms) ? ms : null;
}

function getPoints(repGroup, field /* "weight" | "reps" */) {
    const hist = Array.isArray(repGroup?.history) ? repGroup.history : [];
    const pts = [];

    for (const e of hist) {
        const t = parseIsoMs(e?.dateTime);
        const y = toScalarLR(e?.[field]);
        if (t != null && y != null) pts.push({ t, y });
    }

    pts.sort((a, b) => a.t - b.t);

    const MAX_POINTS = 30;
    return pts.length > MAX_POINTS ? pts.slice(pts.length - MAX_POINTS) : pts;
}

function getPointsBySide(repGroup, field /* "weight" | "reps" */) {
    const hist = Array.isArray(repGroup?.history) ? repGroup.history : [];

    const left = [];
    const right = [];

    for (const e of hist) {
        const t = parseIsoMs(e?.dateTime);
        if (t == null) continue;

        const v = e?.[field];

        const yl = toSide(v, "left");
        const yr = toSide(v, "right");

        if (yl != null) left.push({ t, y: yl });
        if (yr != null) right.push({ t, y: yr });
    }

    left.sort((a, b) => a.t - b.t);
    right.sort((a, b) => a.t - b.t);

    const MAX_POINTS = 30;
    return {
        left: left.length > MAX_POINTS ? left.slice(left.length - MAX_POINTS) : left,
        right: right.length > MAX_POINTS ? right.slice(right.length - MAX_POINTS) : right,
    };
}

function fmtDate(ms) {
    const d = new Date(ms);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}`;
}

function buildTimeline(seriesList) {
    const timeline = new Set();

    for (const points of seriesList) {
        for (const point of points || []) {
            if (point?.t != null) timeline.add(point.t);
        }
    }

    return Array.from(timeline).sort((a, b) => a - b);
}

function getRepGroupTimeline(repGroup) {
    const hist = Array.isArray(repGroup?.history) ? repGroup.history : [];
    const timeline = [];

    for (const entry of hist) {
        const t = parseIsoMs(entry?.dateTime);
        if (t != null) timeline.push(t);
    }

    timeline.sort((a, b) => a - b);
    return timeline.filter((t, index) => index === 0 || timeline[index - 1] !== t);
}

function getDefaultViewportState(timeline) {
    const total = timeline.length;
    const windowSize = total ? Math.min(DEFAULT_WINDOW_POINTS, total) : 1;

    return {
        windowSize,
        startIndex: Math.max(0, total - windowSize),
        focusT: null,
    };
}

function getViewport(timeline, viewState) {
    if (!timeline.length) {
        return {
            startIndex: 0,
            endIndex: 0,
            windowSize: 1,
            minT: 0,
            maxT: 1,
            visibleTimeline: [],
        };
    }

    const windowSize = clamp(viewState?.windowSize ?? timeline.length, 1, timeline.length);
    const maxStart = Math.max(0, timeline.length - windowSize);
    const startIndex = clamp(viewState?.startIndex ?? maxStart, 0, maxStart);
    const endIndex = Math.min(timeline.length - 1, startIndex + windowSize - 1);

    return {
        startIndex,
        endIndex,
        windowSize,
        minT: timeline[startIndex],
        maxT: timeline[endIndex],
        visibleTimeline: timeline.slice(startIndex, endIndex + 1),
    };
}

function filterPointsInRange(points, minT, maxT) {
    return (points || []).filter((point) => point.t >= minT && point.t <= maxT);
}

function getNearestPoint(points, targetT) {
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const point of points || []) {
        const distance = Math.abs(point.t - targetT);
        if (distance < nearestDistance) {
            nearest = point;
            nearestDistance = distance;
        }
    }

    return nearest;
}

function computeDomain(seriesList) {
    // seriesList: Array<Array<{t,y}>>
    const all = seriesList.flat();
    if (!all.length) {
        return { minT: 0, maxT: 1, minY: 0, maxY: 1 };
    }

    const ts = all.map(p => p.t);
    const ys = all.map(p => p.y);

    const minT = Math.min(...ts);
    const maxT = Math.max(...ts);

    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);

    if (minY === maxY) {
        minY -= 1;
        maxY += 1;
    } else {
        const m = (maxY - minY) * 0.1;
        minY -= m;
        maxY += m;
    }

    return { minT, maxT: maxT || (minT + 1), minY, maxY };
}

function drawAxes(ctx, cssW, cssH, { title, suffix, padL, padR, padT, padB, border, muted }) {
    const plotW = Math.max(10, cssW - padL - padR);
    const plotH = Math.max(10, cssH - padT - padB);

    // title
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillStyle = muted;
    ctx.textBaseline = "top";
    ctx.fillText(title, 8, 6);

    // axes lines
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    return { plotW, plotH };
}

function drawGrid(ctx, { padL, padT, plotW, plotH, border }) {
    ctx.save();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.45;

    for (let i = 1; i <= 2; i += 1) {
        const y = padT + (plotH * i) / 3;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + plotW, y);
        ctx.stroke();
    }

    const midX = padL + plotW / 2;
    ctx.beginPath();
    ctx.moveTo(midX, padT);
    ctx.lineTo(midX, padT + plotH);
    ctx.stroke();
    ctx.restore();
}

function drawLabels(ctx, cssW, { minY, maxY, minT, maxT, suffix, padL, padT, plotH, muted }) {
    // y labels
    ctx.fillStyle = muted;
    ctx.textBaseline = "middle";
    const round1 = (v) => String(Math.round(v * 10) / 10);
    ctx.fillText(round1(maxY) + suffix, 6, padT + 2);
    ctx.fillText(round1(minY) + suffix, 6, padT + plotH);

    // x labels
    ctx.textBaseline = "top";
    ctx.fillText(fmtDate(minT), padL, padT + plotH + 4);
    ctx.fillText(fmtDate(maxT), Math.max(padL, padL + (cssW - padL - 10) - 34), padT + plotH + 4);
}

function drawSeries(ctx, points, { xFor, yFor, strokeStyle, lineWidth = 2 }) {
    if (!points.length) return;

    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.beginPath();
    points.forEach((p, i) => {
        const x = xFor(p.t);
        const y = yFor(p.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

function drawPointMarkers(ctx, points, { xFor, yFor, fillStyle }) {
    if (!points.length) return;

    ctx.save();
    ctx.fillStyle = fillStyle;
    ctx.globalAlpha = 0.9;

    for (const point of points) {
        ctx.beginPath();
        ctx.arc(xFor(point.t), yFor(point.y), 2.4, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function fillUnderSeries(ctx, points, { xFor, yFor, padT, plotH, fillStyle }) {
    if (!points.length) return;

    ctx.beginPath();
    points.forEach((p, i) => {
        const x = xFor(p.t);
        const y = yFor(p.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });

    ctx.lineTo(xFor(points[points.length - 1].t), padT + plotH);
    ctx.lineTo(xFor(points[0].t), padT + plotH);
    ctx.closePath();

    ctx.fillStyle = fillStyle;
    ctx.fill();
}

function drawLastMarker(ctx, points, { xFor, yFor, dotStyle, textStyle, suffix, cssW, labelOffsetY = 4 }) {
    if (!points.length) return;
    const last = points[points.length - 1];

    const lx = xFor(last.t);
    const ly = yFor(last.y);

    ctx.beginPath();
    ctx.fillStyle = dotStyle;
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fill();

    const round1 = (v) => String(Math.round(v * 10) / 10);
    ctx.fillStyle = textStyle;
    ctx.textBaseline = "bottom";
    ctx.fillText(`${round1(last.y)}${suffix}`, Math.min(cssW - 54, lx + 6), ly - labelOffsetY);
}

function drawFocusOverlay(ctx, focusEntries, {
    focusT,
    xFor,
    yFor,
    padT,
    plotH,
    cssW,
    padR,
    suffix,
    text,
    muted,
    border,
}) {
    if (!focusEntries.length) return;

    const round1 = (value) => String(Math.round(value * 10) / 10);
    const anchorX = xFor(focusT);

    ctx.save();
    ctx.strokeStyle = border;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(anchorX, padT);
    ctx.lineTo(anchorX, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const entry of focusEntries) {
        ctx.beginPath();
        ctx.fillStyle = entry.color;
        ctx.arc(xFor(entry.point.t), yFor(entry.point.y), 4, 0, Math.PI * 2);
        ctx.fill();
    }

    const lines = [fmtDate(focusEntries[0].point.t)];
    for (const entry of focusEntries) {
        const prefix = entry.label ? `${entry.label}: ` : "";
        lines.push(`${prefix}${round1(entry.point.y)}${suffix}`);
    }

    ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    const boxWidth = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 18;
    const boxHeight = 8 + (lines.length * 16);
    const boxX = clamp(anchorX + 10, 8, cssW - padR - boxWidth);
    const boxY = padT + 6;

    ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
    ctx.strokeStyle = border;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 10);
    ctx.fill();
    ctx.stroke();

    lines.forEach((line, index) => {
        ctx.fillStyle = index === 0 ? text : muted;
        ctx.textBaseline = "top";
        ctx.fillText(line, boxX + 9, boxY + 6 + (index * 16));
    });

    ctx.restore();
}

function drawLineChart(canvas, points, { title = "", suffix = "" } = {}) {
    // Backward-compatible single-series chart
    return drawMultiLineChart(canvas, { main: points }, { title, suffix });
}

/**
 * Multi-series chart.
 * seriesMap: { [key]: Array<{t,y}> }
 */
function drawMultiLineChart(canvas, seriesMap, { title = "", suffix = "", interaction = null } = {}) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cssW = canvas.clientWidth || 320;
    const cssH = canvas.clientHeight || 110;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, cssW, cssH);

    const cssVar = (name, fallback) => {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    };

    const border = cssVar("--border", "rgba(255,255,255,0.16)");
    const muted = cssVar("--muted", "rgba(255,255,255,0.75)");
    const text = cssVar("--text", "rgba(255,255,255,0.95)");

    // Two distinguishable (but subtle) colors; no CSS var available for "secondary"
    const lineA = text; // primary
    const lineB = "rgba(34, 197, 94, 0.95)"; // green-ish secondary
    const fill = "rgba(96, 165, 250, 0.14)";

    const padL = 38;
    const padR = 10;
    const padT = 22;
    const padB = 22;

    const seriesList = Object.values(seriesMap).filter(Boolean);
    const anyPoints = seriesList.some(s => s.length > 0);

    if (!anyPoints) {
        ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        ctx.fillStyle = muted;
        ctx.textBaseline = "top";
        ctx.fillText(title, 8, 6);
        ctx.textBaseline = "middle";
        ctx.fillText("No history yet", 8, cssH / 2);
        return null;
    }

    const { plotW, plotH } = drawAxes(ctx, cssW, cssH, { title, suffix, padL, padR, padT, padB, border, muted });

    const timeline = buildTimeline(seriesList);
    const viewport = interaction ? getViewport(interaction.timeline || timeline, interaction.viewState) : getViewport(timeline, { windowSize: timeline.length, startIndex: 0 });
    const visibleSeriesMap = Object.fromEntries(
        Object.entries(seriesMap).map(([key, points]) => [key, filterPointsInRange(points || [], viewport.minT, viewport.maxT)])
    );
    const visibleSeriesList = Object.values(visibleSeriesMap);
    const domainSource = visibleSeriesList.some((points) => points.length > 0) ? visibleSeriesList : seriesList;
    const { minY, maxY } = computeDomain(domainSource);
    const minT = viewport.minT;
    const maxT = viewport.maxT;

    const xFor = (t) => padL + ((t - minT) / ((maxT - minT) || 1)) * plotW;
    const yFor = (y) => padT + (1 - (y - minY) / ((maxY - minY) || 1)) * plotH;

    // labels
    drawLabels(ctx, cssW, { minY, maxY, minT, maxT, suffix, padL, padT, plotH, muted });
    drawGrid(ctx, { padL, padT, plotW, plotH, border });

    // draw + fill
    // Fill only the first series to avoid clutter
    const keys = Object.keys(visibleSeriesMap);
    const firstKey = keys[0];
    const firstSeries = visibleSeriesMap[firstKey] || [];

    fillUnderSeries(ctx, firstSeries, { xFor, yFor, padT, plotH, fillStyle: fill });

    // Lines (up to 2 expected: left/right)
    const key0 = keys[0];
    const key1 = keys[1];

    if (key0) {
        drawSeries(ctx, visibleSeriesMap[key0] || [], { xFor, yFor, strokeStyle: lineA, lineWidth: 2 });
        drawPointMarkers(ctx, visibleSeriesMap[key0] || [], { xFor, yFor, fillStyle: lineA });
    }
    if (key1) {
        drawSeries(ctx, visibleSeriesMap[key1] || [], { xFor, yFor, strokeStyle: lineB, lineWidth: 2 });
        drawPointMarkers(ctx, visibleSeriesMap[key1] || [], { xFor, yFor, fillStyle: lineB });
    }

    const focusT = interaction?.viewState?.focusT;
    const focusEntries = focusT == null
        ? []
        : keys
            .map((key, index) => {
                const point = getNearestPoint(visibleSeriesMap[key] || [], focusT);
                if (!point) return null;
                return {
                    point,
                    label: interaction?.seriesLabels?.[key] || (keys.length > 1 ? key : ""),
                    color: index === 0 ? lineA : lineB,
                };
            })
            .filter(Boolean);

    // Last markers/labels
    if (focusEntries.length) {
        drawFocusOverlay(ctx, focusEntries, {
            focusT: focusEntries[0].point.t,
            xFor,
            yFor,
            padT,
            plotH,
            cssW,
            padR,
            suffix,
            text,
            muted,
            border,
        });
    } else {
        if (key0) drawLastMarker(ctx, visibleSeriesMap[key0] || [], { xFor, yFor, dotStyle: lineA, textStyle: muted, suffix, cssW, labelOffsetY: 4 });
        if (key1) drawLastMarker(ctx, visibleSeriesMap[key1] || [], { xFor, yFor, dotStyle: lineB, textStyle: muted, suffix, cssW, labelOffsetY: 16 });
    }

    return {
        padL,
        plotW,
        visibleTimeline: viewport.visibleTimeline,
    };
}

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