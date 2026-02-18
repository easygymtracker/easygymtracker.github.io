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

    // keep last N for readability
    const MAX_POINTS = 30;
    return pts.length > MAX_POINTS ? pts.slice(pts.length - MAX_POINTS) : pts;
}

function fmtDate(ms) {
    const d = new Date(ms);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}`;
}

function drawLineChart(canvas, points, { title = "", suffix = "" } = {}) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // HiDPI scale
    const cssW = canvas.clientWidth || 320;
    const cssH = canvas.clientHeight || 110;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // clear
    ctx.clearRect(0, 0, cssW, cssH);

    // theme colors from CSS vars (fallbacks)
    const cssVar = (name, fallback) => {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    };

    const border = cssVar("--border", "rgba(255,255,255,0.16)");
    const muted = cssVar("--muted", "rgba(255,255,255,0.75)");
    const text = cssVar("--text", "rgba(255,255,255,0.95)");
    const fill = "rgba(96, 165, 250, 0.14)"; // subtle, intentionally consistent

    const padL = 38;
    const padR = 10;
    const padT = 22;
    const padB = 22;

    const plotW = Math.max(10, cssW - padL - padR);
    const plotH = Math.max(10, cssH - padT - padB);

    // title
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillStyle = muted;
    ctx.textBaseline = "top";
    ctx.fillText(title, 8, 6);

    if (!points.length) {
        ctx.fillStyle = muted;
        ctx.textBaseline = "middle";
        ctx.fillText("No history yet", 8, cssH / 2);
        return;
    }

    const ys = points.map(p => p.y);
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

    const minT = points[0].t;
    const maxT = points[points.length - 1].t || (minT + 1);

    const xFor = (t) => padL + ((t - minT) / ((maxT - minT) || 1)) * plotW;
    const yFor = (y) => padT + (1 - (y - minY) / ((maxY - minY) || 1)) * plotH;

    // axes
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    // y labels
    ctx.fillStyle = muted;
    ctx.textBaseline = "middle";
    const round1 = (v) => String(Math.round(v * 10) / 10);
    ctx.fillText(round1(maxY) + suffix, 6, padT + 2);
    ctx.fillText(round1(minY) + suffix, 6, padT + plotH);

    // x labels
    ctx.textBaseline = "top";
    ctx.fillText(fmtDate(minT), padL, padT + plotH + 4);
    ctx.fillText(fmtDate(maxT), Math.max(padL, padL + plotW - 34), padT + plotH + 4);

    // line
    ctx.strokeStyle = text;
    ctx.lineWidth = 2;
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

    // fill under line
    ctx.lineTo(xFor(points[points.length - 1].t), padT + plotH);
    ctx.lineTo(xFor(points[0].t), padT + plotH);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    // last dot + label
    const last = points[points.length - 1];
    const lx = xFor(last.t);
    const ly = yFor(last.y);

    ctx.beginPath();
    ctx.fillStyle = text;
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = muted;
    ctx.textBaseline = "bottom";
    ctx.fillText(`${round1(last.y)}${suffix}`, Math.min(cssW - 54, lx + 6), ly - 4);
}

function skeletonHtml({ weightTitle, repsTitle }) {
    return `
    <div class="repGroupHistoryCharts" style="display:grid; gap:10px;">
      <div style="border:1px solid var(--border); border-radius:12px; padding:10px;">
        <canvas data-chart="weight" aria-label="${escapeHtml(weightTitle)}"
          style="width:100%; height:120px; display:block;"></canvas>
      </div>

      <div style="border:1px solid var(--border); border-radius:12px; padding:10px;">
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

    containerEl.innerHTML = skeletonHtml({ weightTitle, repsTitle });

    const weightCanvas = containerEl.querySelector('canvas[data-chart="weight"]');
    const repsCanvas = containerEl.querySelector('canvas[data-chart="reps"]');

    console.log(repGroup)

    const render = () => {
        drawLineChart(weightCanvas, getPoints(repGroup, "weight"), { title: weightTitle });
        drawLineChart(repsCanvas, getPoints(repGroup, "reps"), { title: repsTitle });
    };

    render();

    const ro = new ResizeObserver(render);
    ro.observe(containerEl);

    return () => ro.disconnect();
}