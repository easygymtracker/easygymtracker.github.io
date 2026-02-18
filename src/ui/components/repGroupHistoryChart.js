// src/ui/components/repGroupHistoryCharts.js
import { escapeHtml } from "/src/ui/dom.js";

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

function drawLineChart(canvas, points, { title = "", suffix = "" } = {}) {
    // Backward-compatible single-series chart
    return drawMultiLineChart(canvas, { main: points }, { title, suffix });
}

/**
 * Multi-series chart.
 * seriesMap: { [key]: Array<{t,y}> }
 */
function drawMultiLineChart(canvas, seriesMap, { title = "", suffix = "" } = {}) {
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

    // title
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillStyle = muted;
    ctx.textBaseline = "top";
    ctx.fillText(title, 8, 6);

    if (!anyPoints) {
        ctx.fillStyle = muted;
        ctx.textBaseline = "middle";
        ctx.fillText("No history yet", 8, cssH / 2);
        return;
    }

    const { plotW, plotH } = drawAxes(ctx, cssW, cssH, { title, suffix, padL, padR, padT, padB, border, muted });

    const { minT, maxT, minY, maxY } = computeDomain(seriesList);

    const xFor = (t) => padL + ((t - minT) / ((maxT - minT) || 1)) * plotW;
    const yFor = (y) => padT + (1 - (y - minY) / ((maxY - minY) || 1)) * plotH;

    // labels
    drawLabels(ctx, cssW, { minY, maxY, minT, maxT, suffix, padL, padT, plotH, muted });

    // draw + fill
    // Fill only the first series to avoid clutter
    const keys = Object.keys(seriesMap);
    const firstKey = keys[0];
    const firstSeries = seriesMap[firstKey] || [];

    fillUnderSeries(ctx, firstSeries, { xFor, yFor, padT, plotH, fillStyle: fill });

    // Lines (up to 2 expected: left/right)
    const key0 = keys[0];
    const key1 = keys[1];

    if (key0) drawSeries(ctx, seriesMap[key0] || [], { xFor, yFor, strokeStyle: lineA, lineWidth: 2 });
    if (key1) drawSeries(ctx, seriesMap[key1] || [], { xFor, yFor, strokeStyle: lineB, lineWidth: 2 });

    // Last markers/labels
    if (key0) drawLastMarker(ctx, seriesMap[key0] || [], { xFor, yFor, dotStyle: lineA, textStyle: muted, suffix, cssW, labelOffsetY: 4 });
    if (key1) drawLastMarker(ctx, seriesMap[key1] || [], { xFor, yFor, dotStyle: lineB, textStyle: muted, suffix, cssW, labelOffsetY: 16 });
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
          style="width:100%; height:120px; display:block;"></canvas>
      </div>

      <div style="border:1px solid var(--border); border-radius:12px; padding:10px;">
        ${legend}
        <canvas data-chart="reps" aria-label="${escapeHtml(repsTitle)}"
          style="width:100%; height:120px; display:block;"></canvas>
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

    const render = () => {
        if (isUnilateral) {
            const w = getPointsBySide(repGroup, "weight");
            const r = getPointsBySide(repGroup, "reps");

            drawMultiLineChart(weightCanvas, { left: w.left, right: w.right }, { title: weightTitle });
            drawMultiLineChart(repsCanvas, { left: r.left, right: r.right }, { title: repsTitle });
        } else {
            drawLineChart(weightCanvas, getPoints(repGroup, "weight"), { title: weightTitle });
            drawLineChart(repsCanvas, getPoints(repGroup, "reps"), { title: repsTitle });
        }
    };

    render();

    const ro = new ResizeObserver(render);
    ro.observe(containerEl);

    return () => ro.disconnect();
}