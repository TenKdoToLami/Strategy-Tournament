/**
 * Strategy Tournament — Quant Console Engine
 * Professional multi-tab dashboard with interactive simulations.
 */

'use strict';

// ── Tooltip Engine ──────────────────────────────────────────────────
function initTooltipEngine(chartIds) {
    const tooltip = document.getElementById('chart-tooltip');

    chartIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el || el.dataset.tooltipInitialized) return;
        el.dataset.tooltipInitialized = 'true';

        el.on('plotly_hover', data => {
            const pt = data.points[0];
            const date = pt.x;
            const xIdx = pt.pointIndex;

            const items = el.data
                .filter(trace => trace.name && trace.hoverinfo !== 'skip')
                .map(trace => {
                    let val = trace.y[xIdx];
                    let displayVal = "";
                    const layout = el.layout || {};
                    const isPct = (layout.yaxis && layout.yaxis.tickformat === '.0%') || (layout.yaxis && layout.yaxis.tickformat === '.1%');

                    if (val === null || val === undefined) return null;

                    if (isPct) displayVal = (val * 100).toFixed(1) + '%';
                    else if (layout.yaxis && layout.yaxis.type === 'log') displayVal = val.toFixed(2);
                    else displayVal = val.toFixed(2) + (id.includes('leverage') ? 'x' : '');

                    return {
                        name: trace.name,
                        val: val,
                        displayVal: displayVal,
                        color: (trace.line ? trace.line.color : (trace.marker ? trace.marker.color : '#fff'))
                    };
                })
                .filter(x => x !== null);

            items.sort((a, b) => b.val - a.val);

            let html = `<div class="tooltip-date">${date}</div>`;
            items.forEach(item => {
                html += `
                    <div class="tooltip-item">
                        <div class="tooltip-name-group">
                            <div class="tooltip-dot" style="background:${item.color}"></div>
                            <span>${item.name}</span>
                        </div>
                        <span class="tooltip-value">${item.displayVal}</span>
                    </div>
                `;
            });

            tooltip.innerHTML = html;
            tooltip.style.display = 'block';

            const margin = 20;
            let x = data.event.clientX + margin;
            let y = data.event.clientY - 20;
            if (x + 220 > window.innerWidth) x = data.event.clientX - 240;
            if (y + tooltip.offsetHeight > window.innerHeight) y = window.innerHeight - tooltip.offsetHeight - 10;

            tooltip.style.left = x + 'px';
            tooltip.style.top = y + 'px';
        });

        el.on('plotly_unhover', () => {
            tooltip.style.display = 'none';
        });
    });
}

// ── Registry Build ────────────────────────────────────────────────
const STRATEGY_DATA = window.STRATEGY_REGISTRY_DATA || [];
const STRATEGY_META = window.STRATEGY_METADATA || { groups: [], logics: [], mixes: [], trends: [] };
const STRATEGY_MAP = {};
STRATEGY_DATA.forEach(s => STRATEGY_MAP[s.id] = s);

// ── State ──────────────────────────────────────────────────────────
const activeFilters = {
    level: [...STRATEGY_META.groups],
    logic: [...STRATEGY_META.logics],
    mix: [...STRATEGY_META.mixes],
    trend: [...STRATEGY_META.trends]
};

let labWeights = [
    { VOO: 100, SSO: 0, SPYU: 0, DJP: 0, BILL: 0 },
    { VOO: 50, SSO: 50, SPYU: 0, DJP: 0, BILL: 0 },
    { VOO: 0, SSO: 100, SPYU: 0, DJP: 0, BILL: 0 },
    { VOO: 0, SSO: 50, SPYU: 50, DJP: 0, BILL: 0 },
    { VOO: 0, SSO: 0, SPYU: 100, DJP: 0, BILL: 0 }
];

let globalData = null;
let currentSortKey = 'CAGR';
let currentSortAsc = false;
let currentTab = 'dashboard';
window.hiddenStrategies = new Set();

function toggleVisibility(name, event) {
    if (event) event.stopPropagation();
    if (window.hiddenStrategies.has(name)) {
        window.hiddenStrategies.delete(name);
    } else {
        window.hiddenStrategies.add(name);
    }
    localStorage.setItem('quant_hidden_strategies', JSON.stringify(Array.from(window.hiddenStrategies)));
    update();
}

// ── Color System ───────────────────────────────────────────────────
const BENCHMARK_COLORS = {
    'Benchmark SPY (1x)': '#ffd866',
    'Benchmark SSO (2x)': '#ff6b6b',
    'Benchmark SPYU (4x)': '#ee3344',
    'Benchmark DJP (1x)': '#4ecdc4',
    'Inflation (CPI)': '#8892b0',
    'Special BEAST': '#ff79c6',
    'Special SCALPEL': '#8be9fd',
    'Special SHIELD': '#f1fa8c'
};

function getAdaptiveColor(index, total) {
    if (total === 0) return '#ffffff';
    const hue = (index * 360) / total;
    return `hsl(${hue}, 70%, 62%)`;
}

// ── Plotly Theme ───────────────────────────────────────────────────
const PLOTLY_LAYOUT = {
    template: 'plotly_dark',
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { l: 50, r: 16, t: 32, b: 40 },
    hovermode: 'x unified',
    xaxis: { gridcolor: 'rgba(255,255,255,0.04)', zeroline: false },
    yaxis: { gridcolor: 'rgba(255,255,255,0.04)', tickformat: '.1%', zeroline: false },
    legend: { orientation: 'h', y: 1.15, x: 0, font: { size: 10, family: 'Inter, sans-serif' } },
    font: { family: 'Inter, sans-serif', color: '#8892b0' }
};

const PLOTLY_CONFIG = { responsive: true, displayModeBar: false };

function cloneLayout() { return JSON.parse(JSON.stringify(PLOTLY_LAYOUT)); }

// ── Logic simulator data ───────────────────────────────────────────
let simMaxTierReached = 0;

function parseStrategy(name) {
    const entry = STRATEGY_MAP[name];
    if (entry) {
        return {
            level: entry.group,
            logic: entry.params.logic,
            mix: entry.params.mix,
            trend: entry.params.trend || 'No-Trend',
            text: entry.text
        };
    }
    // Fallback for custom or legacy
    if (name.startsWith('Benchmark')) return { level: 'Benchmark', logic: 'Daily', mix: 'Pure' };
    if (name.startsWith('Special')) return { level: 'Special', logic: 'Daily', mix: 'Pure' };
    const parts = name.split(' ');
    return { level: parts[0], logic: parts[1], mix: parts[2] || 'Safeties' };
}

// ── Lab Simulation Engine ──────────────────────────────────────────
function simulateCustomStrategy(bounds, useRatchet, useSafeties, useTrend) {
    const raw = globalData.raw_returns;
    const n = raw.VOO.length;
    const sma = globalData.signals.sma200;

    let spyCum = 1.0, spyAth = 1.0;
    const dds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        spyCum *= (1 + raw.VOO[i]);
        if (spyCum > spyAth) spyAth = spyCum;
        dds[i] = (spyCum - spyAth) / spyAth;
    }

    const tiers = new Int8Array(n);
    let currentMaxTier = 0;
    for (let i = 1; i < n; i++) {
        const yDD = dds[i - 1];
        const ySMA = sma[i - 1];
        let tier = 0;
        if (yDD <= -bounds[3] / 100) tier = 4;
        else if (yDD <= -bounds[2] / 100) tier = 3;
        else if (yDD <= -bounds[1] / 100) tier = 2;
        else if (yDD <= -bounds[0] / 100) tier = 1;

        if (useTrend && ySMA === 0) tier = 0;

        if (useRatchet) {
            if (yDD >= 0) currentMaxTier = 0;
            else if (tier > currentMaxTier) currentMaxTier = tier;
            tiers[i] = currentMaxTier;
        } else {
            tiers[i] = tier;
        }
    }

    const results = new Float32Array(n);
    const leverage = new Float32Array(n);
    const normWeights = labWeights.map(row => {
        const sum = (row.VOO + row.SSO + row.SPYU + row.DJP + row.BILL) || 100;
        return { VOO: row.VOO / sum, SSO: row.SSO / sum, SPYU: row.SPYU / sum, DJP: row.DJP / sum, BILL: row.BILL / sum };
    });

    for (let i = 0; i < n; i++) {
        const t = tiers[i];
        const w = normWeights[t];
        results[i] = raw.VOO[i] * w.VOO + raw.SSO[i] * w.SSO + raw.SPYU[i] * w.SPYU + raw.DJP[i] * w.DJP + raw.BILL[i] * w.BILL;
        leverage[i] = w.VOO + w.SSO * 2 + w.SPYU * 4 + w.DJP;
    }
    return { returns: results, leverage };
}

// ── Main Update Loop ───────────────────────────────────────────────
function update() {
    if (!globalData) return;
    const start = document.getElementById('start-date').value;
    const end = document.getElementById('end-date').value;
    const startIndex = globalData.dates.findIndex(d => d >= start);
    const endIndex = globalData.dates.findLastIndex(d => d <= end);
    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) return;

    const slicedDates = globalData.dates.slice(startIndex, endIndex + 1);
    const years = (new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24 * 365.25);

    const activeStrategyNames = Object.keys(globalData.variants).filter(name => {
        if (name.startsWith('Benchmark') || name.startsWith('Special')) return false;
        const meta = parseStrategy(name);
        return activeFilters.level.includes(meta.level) && 
               activeFilters.logic.includes(meta.logic) && 
               activeFilters.mix.includes(meta.mix) &&
               activeFilters.trend.includes(meta.trend);
    });

    const traces = { linear: [], log: [], drawdown: [], vol: [], yearly: [], leverage: [], real: [] };
    const metricsArr = [];

    const allVariants = { ...globalData.variants };
    if (window.customStrategyResult) allVariants['🧪 USER CUSTOM LAB'] = window.customStrategyResult.returns;

    for (const [name, returns] of Object.entries(allVariants)) {
        const meta = parseStrategy(name);
        const isCustom = name === '🧪 USER CUSTOM LAB';

        let color;
        if (isCustom) color = '#39ff14';
        else if (meta.level === 'Benchmark' || meta.level === 'Special') {
            if (!activeFilters.level.includes(meta.level)) continue;
            color = BENCHMARK_COLORS[name];
        } else {
            if (!activeFilters.level.includes(meta.level) || !activeFilters.logic.includes(meta.logic) || !activeFilters.mix.includes(meta.mix)) continue;
            color = getAdaptiveColor(activeStrategyNames.indexOf(name), activeStrategyNames.length);
        }

        const slice = isCustom ? window.customStrategyResult.returns.slice(startIndex, endIndex + 1) : returns.slice(startIndex, endIndex + 1);
        let cum = 1.0, maxVal = 1.0, maxDD = 0, sumReturn = 0;
        const cumSeries = [1.0];
        const ddSeries = [0.0];

        for (let i = 0; i < slice.length; i++) {
            const ret = slice[i];
            cum *= (1 + ret);
            cumSeries.push(cum);
            if (cum > maxVal) maxVal = cum;
            const dd = (cum - maxVal) / maxVal;
            if (dd < maxDD) maxDD = dd;
            ddSeries.push(dd);
            sumReturn += ret;
        }

        const cagr = Math.pow(Math.max(1e-8, cum), 1 / (years || 1)) - 1;
        const vol = Math.sqrt(slice.reduce((a, b) => a + (b - sumReturn / slice.length) ** 2, 0) / slice.length * 252);
        const sharpe = vol > 0.001 ? (cagr - 0.02) / vol : 0;

        const yearlyMap = {};
        for (let i = 0; i < slice.length; i++) {
            const date = slicedDates[i];
            const year = date.substring(0, 4);
            if (!yearlyMap[year]) yearlyMap[year] = 1.0;
            yearlyMap[year] *= (1 + slice[i]);
        }

        metricsArr.push({
            Strategy: name, 'Total %': cum - 1, CAGR: cagr, 'Avg Ann Ret': (sumReturn / slice.length) * 252,
            'Max DD': maxDD, Sharpe: sharpe, 'Ann. Vol': vol, color, cumSeries, ddSeries
        });

        if (currentTab === 'dashboard' && !window.hiddenStrategies.has(name)) {
            const width = (isCustom || name.includes('Ratchet') || name.includes('Standard')) ? 2 : 1;
            const chartReturns = cumSeries.slice(1);
            const chartDD = ddSeries.slice(1);

            traces.linear.push({ x: slicedDates, y: chartReturns.map(v => v - 1), name, line: { color, width }, type: 'scatter', mode: 'lines', legendgroup: name, hoverinfo: 'none' });
            traces.log.push({ x: slicedDates, y: chartReturns.map(v => Math.max(1e-6, v)), name, line: { color, width }, type: 'scatter', mode: 'lines', legendgroup: name, hoverinfo: 'none' });
            traces.drawdown.push({ x: slicedDates, y: chartDD, name, line: { color, width: 1.5 }, fill: 'tozeroy', type: 'scatter', mode: 'lines', legendgroup: name, hoverinfo: 'none' });

            const rollVol = [];
            for (let i = 0; i < slice.length; i++) {
                if (i >= 252) {
                    const win = slice.slice(i - 252, i);
                    const avg = win.reduce((a, b) => a + b, 0) / 252;
                    rollVol.push(Math.sqrt(win.reduce((a, b) => a + (b - avg) ** 2, 0) / 252 * 252));
                } else rollVol.push(null);
            }
            traces.vol.push({ x: slicedDates, y: rollVol, name, line: { color, width: 1 }, type: 'scatter', mode: 'lines', legendgroup: name, hoverinfo: 'none' });

            const levSlice = isCustom ? window.customStrategyResult.leverage.slice(startIndex, endIndex + 1) : globalData.leverage[name].slice(startIndex, endIndex + 1);
            traces.leverage.push({ x: slicedDates, y: levSlice, name, line: { color, width: 2, shape: 'hv' }, type: 'scatter', mode: 'lines', legendgroup: name, hoverinfo: 'none' });

            const normalizedInflation = globalData.inflation.slice(startIndex, endIndex + 1).map((v, i, a) => v / a[0]);
            traces.real.push({ x: slicedDates, y: chartReturns.map((v, i) => v / normalizedInflation[i]), name, line: { color, width }, type: 'scatter', mode: 'lines', legendgroup: name, hoverinfo: 'none' });

            const yearLabels = Object.keys(yearlyMap).sort();
            traces.yearly.push({ x: yearLabels, y: yearLabels.map(y => yearlyMap[y] - 1), name, type: 'bar', marker: { color }, legendgroup: name, hoverinfo: 'none' });
        }
    }

    renderTable(metricsArr);
    
    // Calculate Bear Market Shapes for Visualization
    const signalSlice = globalData.signals.sma200.slice(startIndex, endIndex + 1);
    const bearShapes = [];
    let bearStart = null;
    for (let i = 0; i < signalSlice.length; i++) {
        if (signalSlice[i] === 0) {
            if (bearStart === null) bearStart = slicedDates[i];
        } else {
            if (bearStart !== null) {
                bearShapes.push({
                    type: 'rect', xref: 'x', yref: 'paper',
                    x0: bearStart, x1: slicedDates[i - 1],
                    y0: 0, y1: 1,
                    fillcolor: 'rgba(255, 0, 0, 0.06)',
                    line: { width: 0 },
                    layer: 'below'
                });
                bearStart = null;
            }
        }
    }
    if (bearStart !== null) {
        bearShapes.push({
            type: 'rect', xref: 'x', yref: 'paper',
            x0: bearStart, x1: slicedDates[slicedDates.length - 1],
            y0: 0, y1: 1,
            fillcolor: 'rgba(255, 0, 0, 0.06)',
            line: { width: 0 },
            layer: 'below'
        });
    }

    if (currentTab === 'dashboard') {
        const baseLayout = {
            ...cloneLayout(),
            hovermode: 'x',
            xaxis: { showspikes: true, spikemode: 'across', spikecolor: '#fff', spikethickness: 1 },
            shapes: bearShapes
        };

        // Add dummy trace for legend
        const bearLegend = {
            x: [null], y: [null], name: 'Bearish Trend (SMA200 Active)',
            mode: 'markers', marker: { color: 'rgba(255,0,0,0.2)', symbol: 'square', size: 10 },
            showlegend: true
        };
        const activeTraces = (t) => [bearLegend, ...t];

        const linLay = { ...baseLayout, yaxis: { ...baseLayout.yaxis, title: 'Return (%)', tickformat: '.0%' } };
        Plotly.react('chart-linear', activeTraces(traces.linear), linLay, PLOTLY_CONFIG);

        const logLay = { ...baseLayout, yaxis: { ...baseLayout.yaxis, type: 'log', title: 'Index (Log Scale)' } };
        Plotly.react('chart-log', activeTraces(traces.log), logLay, PLOTLY_CONFIG);

        const ddLay = { ...baseLayout, yaxis: { ...baseLayout.yaxis, title: 'Drawdown (%)', tickformat: '.1%', range: [null, 0] } };
        Plotly.react('chart-drawdown', activeTraces(traces.drawdown), ddLay, PLOTLY_CONFIG);

        const volLay = { ...baseLayout, yaxis: { ...baseLayout.yaxis, title: '1-Year Vol (%)' } };
        Plotly.react('chart-volatility', activeTraces(traces.vol), volLay, PLOTLY_CONFIG);

        const levLay = { ...baseLayout, yaxis: { ...baseLayout.yaxis, title: 'Leverage', range: [0, 4.5], tickformat: '.1f' } };
        Plotly.react('chart-leverage', traces.leverage, levLay, PLOTLY_CONFIG);

        const realLay = { ...baseLayout, yaxis: { ...baseLayout.yaxis, title: 'Real Growth (Inflation Adj)', type: 'log' } };
        Plotly.react('chart-real', traces.real, realLay, PLOTLY_CONFIG);

        const yearLay = { ...cloneLayout(), yaxis: { ...PLOTLY_LAYOUT.yaxis, title: 'Yearly Return (%)', tickformat: '.0%' }, barmode: 'group' };
        Plotly.react('chart-yearly', traces.yearly, yearLay, PLOTLY_CONFIG);

        initTooltipEngine(['chart-linear', 'chart-log', 'chart-drawdown', 'chart-volatility', 'chart-leverage', 'chart-real']);
    }

    window.allMetrics = metricsArr;
    updateExplorer();
}

// ── Table ──────────────────────────────────────────────────────────
function renderTable(metrics) {
    const tbody = document.getElementById('metrics-body');
    tbody.innerHTML = '';
    metrics.sort((a, b) => {
        const aVal = a[currentSortKey], bVal = b[currentSortKey];
        return currentSortAsc ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
    metrics.forEach(m => {
        const isHidden = window.hiddenStrategies.has(m.Strategy);
        const tr = document.createElement('tr');
        if (isHidden) tr.className = 'row-hidden';
        tr.style.cursor = 'pointer';
        tr.onclick = () => { selectStrategyForExplorer(m.Strategy); switchTab('explorer'); };
        tr.innerHTML = `
            <td style="font-weight:600; color:${m.color}">${m.Strategy}</td>
            <td style="color:${m['Total %'] >= 0 ? 'var(--green)' : 'var(--red)'}">${(m['Total %'] * 100).toFixed(0)}%</td>
            <td style="font-weight:700">${(m.CAGR * 100).toFixed(1)}%</td>
            <td>${(m['Avg Ann Ret'] * 100).toFixed(1)}%</td>
            <td style="color:var(--red)">${(m['Max DD'] * 100).toFixed(1)}%</td>
            <td>${m.Sharpe.toFixed(2)}</td>
            <td>${(m['Ann. Vol'] * 100).toFixed(1)}%</td>
            <td style="text-align:center">
                <button class="btn-visibility ${isHidden ? 'hidden' : ''}" onclick="toggleVisibility('${m.Strategy}', event)">
                    ${isHidden ? '🚫' : '👁️'}
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ── Explorer & Lab Analysis Suite ──────────────────────────────────
function selectStrategyForExplorer(name) {
    document.getElementById('explorer-picker').value = name;
    updateExplorer();
}

function renderAnalysisSuite(prefix, name, compareName) {
    if (!name || !window.allMetrics) return;
    const m = window.allMetrics.find(x => x.Strategy === name);
    if (!m) return;

    const nameEl = document.getElementById(`${prefix}-name`);
    if (nameEl) nameEl.textContent = name === '🧪 USER CUSTOM LAB' ? 'Custom Lab Prototype' : name;

    const matrixId = (prefix === 'lab') ? 'lab-allocation-matrix' : 'allocation-matrix';
    const matrixContainer = document.getElementById(matrixId);
    const metaContainer = document.getElementById(`${prefix}-meta-pills`);
    const textContainer = document.getElementById(`${prefix}-description`);

    if (matrixContainer) {
        const entry = STRATEGY_MAP[name] || { bounds: [0.05, 0.1, 0.2, 0.3], weights: [[100,0,0,0,0],[50,50,0,0,0],[0,100,0,0,0],[0,50,50,0,0],[0,0,100,0,0]] };
        const meta = parseStrategy(name);

        const isRatchet = meta.logic === 'Ratchet' || (prefix === 'lab' && document.getElementById('lab-ratchet').checked);
        const useTrend = meta.trend === 'Trend' || (prefix === 'lab' && document.getElementById('lab-trend').checked);

        if (metaContainer) {
            metaContainer.innerHTML = `<span class="pill-badge group-badge">${meta.level}</span>`;
            metaContainer.innerHTML += `<span class="pill-badge ${isRatchet ? 'active' : ''}">${isRatchet ? 'Ratchet Logic' : 'Daily Reset'}</span>`;
            if (meta.mix === 'Pure') metaContainer.innerHTML += '<span class="pill-badge">Pure Equity</span>';
            
            if (useTrend) {
                const signalSlice = globalData.signals.sma200.slice(globalData.dates.indexOf(document.getElementById('start-date').value), globalData.dates.indexOf(document.getElementById('end-date').value) + 1);
                const bearDays = signalSlice.filter(v => v === 0).length;
                const pct = ((bearDays / signalSlice.length) * 100).toFixed(1);
                metaContainer.innerHTML += `<span class="pill-badge active" style="background:rgba(255,82,82,0.1); border-color:var(--red); color:#ff5252">SMA200 Active: ${bearDays.toLocaleString()} Days Protected (${pct}%)</span>`;
            } else {
                metaContainer.innerHTML += '<span class="pill-badge" style="opacity:0.5">No Trend Filter (Always 100% Active)</span>';
            }
        }
        if (textContainer && meta.text) textContainer.innerHTML = `<p class="strategy-description">${meta.text}</p>`;

        let weights = entry.weights;
        if (prefix === 'lab') weights = labWeights.map(r => [r.VOO, r.SSO, r.SPYU, r.DJP, r.BILL]);

        let b = entry.bounds;
        if (prefix === 'lab' || name === '🧪 USER CUSTOM LAB') {
            b = [
                parseFloat(document.getElementById('lab-b1').value),
                parseFloat(document.getElementById('lab-b2').value),
                parseFloat(document.getElementById('lab-b3').value),
                parseFloat(document.getElementById('lab-b4').value)
            ]; // Values are already percentages from inputs
        }

        let tableHtml = `<table class="weights-table-explorer"><thead><tr><th>Tier / Drawdown</th><th>VOO</th><th>SSO</th><th>SPYU</th><th>DJP</th><th>BILL</th><th>Lev</th></tr></thead><tbody>`;
        weights.forEach((w, i) => {
            const lev = (w[0] * 1 + w[1] * 2 + w[2] * 4 + w[3] * 1) / 100;
            
            let rangeStr = (i === 0) ? `0 – ${b[0].toFixed(1)}%` : (i === 4) ? `> ${b[3].toFixed(1)}%` : `${b[i - 1].toFixed(1)} – ${b[i].toFixed(1)}%`;
            const isTrendTarget = (useTrend && i === 0);
            
            tableHtml += `<tr>
                <td class="tier-highlight">
                    <div style="font-size:0.75rem">Tier ${i}</div>
                    <div style="font-size:0.6rem; opacity:0.7">${rangeStr}</div>
                    ${isTrendTarget ? '<div class="trend-tag">SMA Safety Target</div>' : ''}
                </td>
                <td>${w[0].toFixed(0)}%</td>
                <td>${w[1].toFixed(0)}%</td>
                <td>${w[2].toFixed(0)}%</td>
                <td>${w[3].toFixed(0)}%</td>
                <td>${w[4].toFixed(0)}%</td>
                <td class="lev-high">${lev.toFixed(2)}x</td>
            </tr>`;
        });
        tableHtml += '</tbody></table>';
        matrixContainer.innerHTML = tableHtml;
    }

    const chartReturns = m.cumSeries.slice(1);
    const startIndex = globalData.dates.length - chartReturns.length;
    const syncedDates = globalData.dates.slice(startIndex);
    const cObj = compareName ? window.allMetrics.find(x => x.Strategy === compareName) : null;
    const cReturns = cObj ? cObj.cumSeries.slice(cObj.cumSeries.length - chartReturns.length) : null;
    const cDD = cObj ? cObj.ddSeries.slice(cObj.ddSeries.length - chartReturns.length) : null;
    const levFull = (m.Strategy === '🧪 USER CUSTOM LAB' ? window.customStrategyResult.leverage : globalData.leverage[m.Strategy]);
    const levSlice = levFull.slice(startIndex);

    const expBaseLayout = { ...cloneLayout(), margin: { l: 60, r: 20, t: 30, b: 80 }, autosize: true, hoverlabel: { bgcolor: '#1a1d23', font: { color: '#ffffff', size: 12 }, bordercolor: 'var(--accent)' }, xaxis: { showspikes: true, spikemode: 'across', spikecolor: '#fff', spikethickness: 1 } };
    const traces = (yP, yC, nP, nC, pColor, isBar = false) => {
        const arr = [{ x: syncedDates, y: yP, name: nP, line: { color: pColor, width: 3 }, type: isBar ? 'bar' : 'scatter', hoverinfo: 'none' }];
        if (yC) arr.push({ x: syncedDates, y: yC, name: nC, line: { color: 'rgba(255,255,255,0.5)', width: 2, dash: 'dot' }, marker: { color: 'rgba(255,255,255,0.3)' }, type: isBar ? 'bar' : 'scatter', opacity: 0.8, hoverinfo: 'none' });
        return arr;
    };

    Plotly.react(`chart-${prefix}-linear`, traces(chartReturns.map(v => v - 1), cReturns ? cReturns.map(v => v - 1) : null, name, compareName, m.color), { ...expBaseLayout, yaxis: { title: 'Return (%)', tickformat: '.0%' }, height: 450 }, PLOTLY_CONFIG);
    const logLay = { ...expBaseLayout, height: 450 }; logLay.yaxis.type = 'log'; logLay.yaxis.title = 'Index (Log Scale)';
    Plotly.react(`chart-${prefix}-log`, traces(chartReturns, cReturns, name, compareName, m.color), logLay, PLOTLY_CONFIG);
    Plotly.react(`chart-${prefix}-drawdown`, traces(m.ddSeries.slice(1), cDD, name, compareName, '#ff4d4d'), { ...expBaseLayout, yaxis: { title: 'Drawdown (%)', tickformat: '.1%' }, height: 400 }, PLOTLY_CONFIG);

    const computeVol = (sName, sI) => {
        const full = (sName === '🧪 USER CUSTOM LAB' ? window.customStrategyResult.returns : globalData.variants[sName]);
        return syncedDates.map((_, i) => { const absIdx = sI + i; if (absIdx < 252) return null; const win = full.slice(absIdx - 252, absIdx); const avg = win.reduce((a, b) => a + b, 0) / 252; return Math.sqrt(win.reduce((a, b) => a + (b - avg) ** 2, 0) / 252 * 252); });
    };
    const pVol = computeVol(name, startIndex); const cVol = compareName ? computeVol(compareName, globalData.dates.length - chartReturns.length) : null;
    Plotly.react(`chart-${prefix}-vol`, traces(pVol, cVol, name, compareName, 'var(--orange)'), { ...expBaseLayout, yaxis: { title: '1-Year Vol (%)', tickformat: '.0%' }, height: 400 }, PLOTLY_CONFIG);
    const cLev = cObj ? (compareName === '🧪 USER CUSTOM LAB' ? window.customStrategyResult.leverage : globalData.leverage[compareName]).slice(globalData.dates.length - chartReturns.length) : null;
    Plotly.react(`chart-${prefix}-leverage`, traces(levSlice, cLev, name, compareName, 'var(--blue)'), { ...expBaseLayout, yaxis: { title: 'Leverage', range: [0, 4.5] }, height: 400 }, PLOTLY_CONFIG);
    const inflationNorm = globalData.inflation.slice(startIndex).map((v, i, a) => v / a[0]);
    const chartReal = chartReturns.map((v, i) => v / inflationNorm[i]); const cReal = cReturns ? cReturns.map((v, i) => v / inflationNorm[i]) : null;
    Plotly.react(`chart-${prefix}-real`, traces(chartReal, cReal, name, compareName, 'var(--green)'), { ...expBaseLayout, yaxis: { title: 'Real Growth (Log)', type: 'log' }, height: 450 }, PLOTLY_CONFIG);
    initTooltipEngine([`chart-${prefix}-linear`, `chart-${prefix}-log`, `chart-${prefix}-drawdown`, `chart-${prefix}-vol`, `chart-${prefix}-leverage`, `chart-${prefix}-real`]);

    const getYearly = (sName, sI) => { const full = (sName === '🧪 USER CUSTOM LAB' ? window.customStrategyResult.returns : globalData.variants[sName]); const slice = full.slice(sI); const map = {}; slice.forEach((ret, i) => { if (i < syncedDates.length) { const y = syncedDates[i].substring(0, 4); map[y] = (map[y] || 1.0) * (1 + ret); } }); return map; };
    const pY = getYearly(name, startIndex); const cY = compareName ? getYearly(compareName, globalData.dates.length - chartReturns.length) : null; const years = Object.keys(pY).sort();
    const yTraces = [{ x: years, y: years.map(y => pY[y] - 1), name, type: 'bar', marker: { color: m.color }, hoverinfo: 'none' }];
    if (cY) yTraces.push({ x: Object.keys(cY).sort(), y: Object.keys(cY).sort().map(y => cY[y] - 1), name: compareName, type: 'bar', marker: { color: 'rgba(255,255,255,0.2)' }, hoverinfo: 'none' });
    Plotly.react(`chart-${prefix}-yearly`, yTraces, { ...expBaseLayout, barmode: 'group', yaxis: { title: 'Yearly Return (%)', tickformat: '.0%' }, height: 450 }, PLOTLY_CONFIG);
}

function updateExplorer() {
    renderAnalysisSuite('explorer', document.getElementById('explorer-picker').value, document.getElementById('explorer-compare-picker').value);
}

function updateLabResults() {
    document.getElementById('lab-results').style.display = 'block';
    renderAnalysisSuite('lab', '🧪 USER CUSTOM LAB', document.getElementById('lab-compare-picker').value);
}

function resetLabResults() {
    document.getElementById('lab-results').style.display = 'none';
    window.customStrategyResult = null;
    update();
}

// ── Simulator ───────────────────────────────────────────────────────
// ── Simulator ───────────────────────────────────────────────────────
function updateSimulator() {
    const dd = parseFloat(document.getElementById('drawdown-slider').value);
    document.getElementById('drawdown-value').textContent = `-${dd}%`;
    const simPicker = document.getElementById('sim-strategy-picker');
    const selectedName = simPicker.value || Object.keys(STRATEGY_MAP)[0];
    const entry = STRATEGY_MAP[selectedName] || { 
        bounds: [0.05, 0.1, 0.2, 0.3], 
        weights: [[100,0,0,0,0],[50,50,0,0,0],[0,100,0,0,0],[0,50,50,0,0],[0,0,100,0,0]], 
        params: { logic: 'Daily', trend: 'Trend' } 
    };
    const b = entry.bounds;
    const isRatchet = (entry.params && entry.params.logic === 'Ratchet') || entry.logic === 'Ratchet';
    const isTrendStrat = entry.params && entry.params.trend === 'Trend';
    const trendSignal = document.getElementById('sim-trend-signal').value; // 'bull' or 'bear'
    const isBearish = trendSignal === 'bear';
    
    let dailyTier = 0;
    if (dd >= b[3]) dailyTier = 4; 
    else if (dd >= b[2]) dailyTier = 3; 
    else if (dd >= b[1]) dailyTier = 2; 
    else if (dd >= b[0]) dailyTier = 1;
    
    if (dd === 0) simMaxTierReached = 0; 
    else if (dailyTier > simMaxTierReached) simMaxTierReached = dailyTier;

    let effectiveTier = isRatchet ? simMaxTierReached : dailyTier;

    // Trend De-escalation Override
    let isDeescalated = false;
    if (isTrendStrat && isBearish) {
        effectiveTier = 0;
        isDeescalated = true;
    }

    document.getElementById('sim-daily-state').textContent = `Tier ${dailyTier}`;
    document.getElementById('sim-ratchet-state').textContent = isDeescalated ? `Tier 0 (Trend FORCED)` : `Tier ${simMaxTierReached}`;
    
    // Add Trend Status to Simulator
    const decisionEngine = document.querySelector('.decision-engine h4');
    if (decisionEngine) {
        const trendStatus = isTrendStrat ? ' ✅ Trend Filter Enabled' : ' ❌ No Trend Filter';
        decisionEngine.innerHTML = `<span style="color:var(--accent)">Decision Engine</span><span style="float:right; font-size:0.6rem; opacity:0.7">${trendStatus}</span>`;
    }
    
    const ratchetEl = document.getElementById('sim-ratchet-state');
    if (isDeescalated) {
        ratchetEl.classList.add('trend-warning');
        ratchetEl.style.color = 'var(--red)';
    } else {
        ratchetEl.classList.remove('trend-warning');
        ratchetEl.style.color = 'var(--accent)';
    }

    // Update Boundaries Column
    const boundaryList = document.getElementById('sim-boundaries-list');
    if (boundaryList) {
        const ranges = [
            { t: 'T0', r: `0% — ${b[0].toFixed(0)}%` },
            { t: 'T1', r: `${b[0].toFixed(0)}% — ${b[1].toFixed(0)}%` },
            { t: 'T2', r: `${b[1].toFixed(0)}% — ${b[2].toFixed(0)}%` },
            { t: 'T3', r: `${b[2].toFixed(0)}% — ${b[3].toFixed(0)}%` },
            { t: 'T4', r: `> ${b[3].toFixed(0)}%` }
        ];
        boundaryList.innerHTML = ranges.map((range, i) => `
            <div class="boundary-item" style="color:${i === effectiveTier ? 'var(--accent)' : 'inherit'}">
                <div class="boundary-tier">Tier ${i}</div>
                <div class="boundary-range">${range.r}</div>
            </div>
        `).join('');
    }

    // Update Slider Marks
    const marksContainer = document.getElementById('sim-slider-marks');
    if (marksContainer) {
        marksContainer.innerHTML = b.map((val, i) => {
            const pos = val * 100;
            const isActive = dd >= pos;
            return `<div class="slider-mark ${isActive ? 'active' : ''}" style="left:${pos}%"></div>`;
        }).join('');
    }

    // Update Daily Tower Highlights
    document.querySelectorAll('#flow-svg-daily .flow-node').forEach(n => {
        n.classList.remove('active-market', 'active-execution');
        const id = parseInt(n.id.replace('node-daily-', ''));
        
        // Market Signal is what the drawdown alone says
        if (id === dailyTier) n.classList.add('active-market');
        
        // Execution is where we ACTUALLY are (could be forced to 0)
        // For Daily column, it's either dailyTier OR 0 if de-escalated
        const execTier = isDeescalated ? 0 : dailyTier;
        if (id === execTier) n.classList.add('active-execution');
    });
    document.querySelectorAll('#flow-svg-daily .flow-path').forEach(p => p.classList.remove('active'));
    
    // Path should only go up to execution tier
    const dailyExecLimit = isDeescalated ? 0 : dailyTier;
    for (let i = 0; i < dailyExecLimit; i++) {
        const p = document.getElementById(`path-daily-${i}-${i + 1}`);
        if (p) p.classList.add('active');
    }

    // Update Ratchet Tower Highlights
    document.querySelectorAll('#flow-svg-ratchet .flow-node').forEach(n => {
        n.classList.remove('active-market', 'active-execution');
        const id = parseInt(n.id.replace('node-ratchet-', ''));
        
        // Market Signal is the current max tier
        if (id === simMaxTierReached) n.classList.add('active-market');
        
        // Execution is effectiveTier (could be forced to 0)
        if (id === effectiveTier) n.classList.add('active-execution');
    });
    document.querySelectorAll('#flow-svg-ratchet .flow-path').forEach(p => p.classList.remove('active'));
    
    // Path should only go up to execution tier
    for (let i = 0; i < effectiveTier; i++) {
        const p = document.getElementById(`path-ratchet-${i}-${i + 1}`);
        if (p) p.classList.add('active');
    }

    // Render Execution Matrix
    const matrixContainer = document.getElementById('sim-allocation-matrix');
    if (matrixContainer) {
        let tableHtml = `<table class="excel-table" style="width:100%"><thead><tr><th>Tier</th><th>VOO</th><th>SSO</th><th>SPYU</th><th>DJP</th><th>BILL</th><th>Total</th><th>Lev</th></tr></thead><tbody>`;
        entry.weights.forEach((w, i) => {
            const lev = (w[0] * 1 + w[1] * 2 + w[2] * 4 + w[3] * 1) / 100;
            const sum = w.reduce((s, v) => s + v, 0);
            const isEff = (i === effectiveTier);
            const isDaily = (i === dailyTier && !isEff);
            
            tableHtml += `<tr class="${isEff ? 'active-execution' : ''} ${isDaily ? 'active-market' : ''}">
                <td class="tier-label">T${i}</td>
                <td><input type="text" readonly value="${w[0].toFixed(0)}%"></td>
                <td><input type="text" readonly value="${w[1].toFixed(0)}%"></td>
                <td><input type="text" readonly value="${w[2].toFixed(0)}%"></td>
                <td><input type="text" readonly value="${w[3].toFixed(0)}%"></td>
                <td><input type="text" readonly value="${w[4].toFixed(0)}%"></td>
                <td class="sum-cell" style="background:transparent; color:${Math.abs(sum-100) < 0.1 ? 'var(--green)' : 'var(--red)'}">${sum.toFixed(0)}%</td>
                <td style="font-weight:700; color:var(--text-primary)">${lev.toFixed(2)}x</td>
            </tr>`;
        });
        tableHtml += '</tbody></table>';
        matrixContainer.innerHTML = tableHtml;
    }
}

// ── Tab Switching ───────────────────────────────────────────────────
function switchTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.remove('active');
        if (n.dataset.tab === tabId) n.classList.add('active');
    });
    update();
    if (tabId === 'simulator') updateSimulator();
    setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 100);
}

// ── Initialization ─────────────────────────────────────────────────
async function init() {
    try {
        const response = await fetch('data/data.json');
        globalData = await response.json();
        const dates = globalData.dates;
        const startInput = document.getElementById('start-date');
        const endInput = document.getElementById('end-date');
        startInput.min = startInput.value = dates[0];
        endInput.max = endInput.value = dates[dates.length - 1];

        const picker = document.getElementById('explorer-picker');
        const comparePicker = document.getElementById('explorer-compare-picker');
        const labCompare = document.getElementById('lab-compare-picker');
        const simPicker = document.getElementById('sim-strategy-picker');

        Object.keys(globalData.variants).sort().forEach(name => {
            const opt = document.createElement('option'); opt.value = opt.textContent = name; picker.appendChild(opt);
            const opt2 = document.createElement('option'); opt2.value = opt2.textContent = name; comparePicker.appendChild(opt2);
            const opt3 = document.createElement('option'); opt3.value = opt3.textContent = name; labCompare.appendChild(opt3);
            if (simPicker) {
                const opt4 = document.createElement('option'); opt4.value = opt4.textContent = name; simPicker.appendChild(opt4);
            }
        });

        picker.onchange = updateExplorer;
        comparePicker.onchange = updateExplorer;
        labCompare.onchange = updateLabResults;
        if (simPicker) simPicker.onchange = updateSimulator;

        startInput.onchange = update;
        endInput.onchange = update;
        document.getElementById('reset-btn').onclick = () => { startInput.value = dates[0]; endInput.value = dates[dates.length - 1]; update(); };

        document.querySelectorAll('.pill').forEach(p => p.onclick = () => {
            const group = p.parentElement.id.replace('filter-', '');
            if (p.classList.toggle('active')) activeFilters[group].push(p.dataset.value);
            else activeFilters[group] = activeFilters[group].filter(v => v !== p.dataset.value);
            update();
        });

        document.querySelectorAll('.nav-item').forEach(n => n.onclick = () => switchTab(n.dataset.tab));

        document.getElementById('drawdown-slider').oninput = updateSimulator;
        document.getElementById('sim-trend-signal').onchange = updateSimulator;
        renderWeightTable();

        document.getElementById('lab-run').onclick = () => {
            const bounds = [parseFloat(document.getElementById('lab-b1').value), parseFloat(document.getElementById('lab-b2').value), parseFloat(document.getElementById('lab-b3').value), parseFloat(document.getElementById('lab-b4').value)];
            window.customStrategyResult = simulateCustomStrategy(bounds, document.getElementById('lab-ratchet').checked, document.getElementById('lab-safeties').checked, document.getElementById('lab-trend').checked);
            update();
            updateLabResults();
        };

        document.querySelectorAll('#metrics-table thead th').forEach(th => th.onclick = () => {
            const key = th.dataset.sort;
            if (key === currentSortKey) currentSortAsc = !currentSortAsc;
            else { currentSortKey = key; currentSortAsc = false; }
            update();
        });

        const savedHidden = localStorage.getItem('quant_hidden_strategies');
        if (savedHidden) window.hiddenStrategies = new Set(JSON.parse(savedHidden));

        const loader = document.getElementById('loader');
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 300);
        update();
    } catch (e) {
        console.error('Quant Engine Error:', e);
    }
}

function renderWeightTable() {
    const tbody = document.getElementById('weight-tbody');
    tbody.innerHTML = '';
    labWeights.forEach((row, i) => {
        const tr = document.createElement('tr');
        const assets = ['VOO', 'SSO', 'SPYU', 'DJP', 'BILL'];
        let html = `<td class="tier-label">T${i}</td>`;
        assets.forEach(asset => {
            html += `<td><input type="number" data-tier="${i}" data-asset="${asset}" value="${row[asset]}" onfocus="this.select()"></td>`;
        });
        const sum = assets.reduce((s, a) => s + row[a], 0);
        html += `<td class="sum-cell" id="weight-sum-${i}" style="color:${Math.abs(sum - 100) < 0.1 ? 'var(--green)' : 'var(--red)'}">${sum}%</td>`;
        tr.innerHTML = html;

        tr.querySelectorAll('input').forEach(inp => {
            inp.oninput = e => {
                const t = e.target.dataset.tier;
                const a = e.target.dataset.asset;
                labWeights[t][a] = parseFloat(e.target.value) || 0;
                const newSum = assets.reduce((s, ass) => s + labWeights[t][ass], 0);
                const sumEl = document.getElementById(`weight-sum-${t}`);
                sumEl.textContent = `${newSum}%`;
                sumEl.style.color = Math.abs(newSum - 100) < 0.1 ? 'var(--green)' : 'var(--red)';
            };
            inp.onkeydown = e => {
                const t = parseInt(e.target.dataset.tier);
                const aIdx = assets.indexOf(e.target.dataset.asset);
                let nextT = t, nextA = aIdx;
                if (e.key === 'ArrowUp') nextT--;
                else if (e.key === 'ArrowDown' || e.key === 'Enter') nextT++;
                else if (e.key === 'ArrowLeft') nextA--;
                else if (e.key === 'ArrowRight') nextA++;
                else return;

                if (nextT >= 0 && nextT < labWeights.length && nextA >= 0 && nextA < assets.length) {
                    e.preventDefault();
                    document.querySelector(`input[data-tier="${nextT}"][data-asset="${assets[nextA]}"]`).focus();
                }
            };
        });
        tbody.appendChild(tr);
    });
}

init();
