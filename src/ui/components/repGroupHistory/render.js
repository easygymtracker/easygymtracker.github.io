import {
    buildTimeline,
    clamp,
    computeDomain,
    filterPointsInRange,
    fmtDate,
    getNearestPoint,
    getViewport,
} from "./data.js";

function drawAxes(ctx, cssW, cssH, { title, padL, padR, padT, padB, border, muted }) {
    const plotW = Math.max(10, cssW - padL - padR);
    const plotH = Math.max(10, cssH - padT - padB);

    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillStyle = muted;
    ctx.textBaseline = "top";
    ctx.fillText(title, 8, 6);

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

    for (let index = 1; index <= 2; index += 1) {
        const y = padT + (plotH * index) / 3;
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
    ctx.fillStyle = muted;
    ctx.textBaseline = "middle";
    const round1 = (value) => String(Math.round(value * 10) / 10);
    ctx.fillText(round1(maxY) + suffix, 6, padT + 2);
    ctx.fillText(round1(minY) + suffix, 6, padT + plotH);

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
    points.forEach((point, index) => {
        const x = xFor(point.t);
        const y = yFor(point.y);
        if (index === 0) ctx.moveTo(x, y);
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
    points.forEach((point, index) => {
        const x = xFor(point.t);
        const y = yFor(point.y);
        if (index === 0) ctx.moveTo(x, y);
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

    const round1 = (value) => String(Math.round(value * 10) / 10);
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

export function drawMultiLineChart(canvas, seriesMap, { title = "", suffix = "", interaction = null } = {}) {
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const cssW = canvas.clientWidth || 320;
    const cssH = canvas.clientHeight || 110;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, cssW, cssH);

    const cssVar = (name, fallback) => {
        const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return value || fallback;
    };

    const border = cssVar("--border", "rgba(255,255,255,0.16)");
    const muted = cssVar("--muted", "rgba(255,255,255,0.75)");
    const text = cssVar("--text", "rgba(255,255,255,0.95)");
    const lineA = text;
    const lineB = "rgba(34, 197, 94, 0.95)";
    const fill = "rgba(96, 165, 250, 0.14)";

    const padL = 38;
    const padR = 10;
    const padT = 22;
    const padB = 22;

    const seriesList = Object.values(seriesMap).filter(Boolean);
    const anyPoints = seriesList.some((series) => series.length > 0);

    if (!anyPoints) {
        ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        ctx.fillStyle = muted;
        ctx.textBaseline = "top";
        ctx.fillText(title, 8, 6);
        ctx.textBaseline = "middle";
        ctx.fillText("No history yet", 8, cssH / 2);
        return null;
    }

    const { plotW, plotH } = drawAxes(ctx, cssW, cssH, { title, padL, padR, padT, padB, border, muted });
    const timeline = buildTimeline(seriesList);
    const viewport = interaction
        ? getViewport(interaction.timeline || timeline, interaction.viewState)
        : getViewport(timeline, { windowSize: timeline.length, startIndex: 0 });

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

    drawLabels(ctx, cssW, { minY, maxY, minT, maxT, suffix, padL, padT, plotH, muted });
    drawGrid(ctx, { padL, padT, plotW, plotH, border });

    const keys = Object.keys(visibleSeriesMap);
    const firstSeries = visibleSeriesMap[keys[0]] || [];
    fillUnderSeries(ctx, firstSeries, { xFor, yFor, padT, plotH, fillStyle: fill });

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
