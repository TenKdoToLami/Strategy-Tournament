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
            
            // Extract data directly from the chart's visible traces
            const items = el.data
                .filter(trace => trace.name && trace.hoverinfo !== 'skip')
                .map(trace => {
                    let val = trace.y[xIdx];
                    // Handle log scale or return percentages
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

            // Sort DESC by value for better readability
            items.sort((a, b) => b.val - a.val);

            // Render
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
            
            // Positioning
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

// ── State ──────────────────────────────────────────────────────────
const activeFilters = {
    level: ['Benchmark', 'Special', 'Standard', 'Aggressive', 'Conservative'],
    logic: ['Daily', 'Ratchet'],
    mix: ['Safeties', 'Pure']
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

// ── Parsing ────────────────────────────────────────────────────────
function parseStrategy(name) {
    if (name.startsWith('Benchmark')) return { level: 'Benchmark', logic: 'Daily', mix: 'Safeties' };
    if (name.startsWith('Special')) return { level: 'Special', logic: 'Daily', mix: 'Safeties' };
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
        return activeFilters.level.includes(meta.level) && activeFilters.logic.includes(meta.logic) && activeFilters.mix.includes(meta.mix);
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
        const vol = Math.sqrt(slice.reduce((a, b) => a + (b - sumReturn/slice.length)**2, 0) / slice.length * 252);
        const sharpe = vol > 0.001 ? (cagr - 0.02) / vol : 0;

        // Yearly Mapping for Bar Chart
        const yearlyMap = {};
        for (let i = 0; i < slice.length; i++) {
            const date = slicedDates[i];
            const year = date.substring(0, 4);
            if (!yearlyMap[year]) yearlyMap[year] = 1.0;
            yearlyMap[year] *= (1 + slice[i]);
        }

        metricsArr.push({ 
            Strategy: name, 'Total %': cum - 1, CAGR: cagr, 'Avg Ann Ret': (sumReturn/slice.length)*252, 
            'Max DD': maxDD, Sharpe: sharpe, 'Ann. Vol': vol, color, cumSeries, ddSeries 
        });
        
        if (currentTab === 'dashboard' && !window.hiddenStrategies.has(name)) {
            const width = (isCustom || name.includes('Ratchet') || name.includes('Standard')) ? 2 : 1;
            const chartReturns = cumSeries.slice(1);
            const chartDD = ddSeries.slice(1);

            traces.linear.push({ x: slicedDates, y: chartReturns.map(v => v - 1), name, line: { color, width }, type: 'scatter', mode: 'lines', legendgroup: name, hoverinfo: 'none' });
            traces.log.push({ x: slicedDates, y: chartReturns.map(v => Math.max(1e-6, v)), name, line: { color, width }, type: 'scatter', mode: 'lines', legendgroup: name, hoverinfo: 'none' });
            traces.drawdown.push({ x: slicedDates, y: chartDD, name, line: { color, width: 1 }, fill: 'tonexty', type: 'scatter', mode: 'lines', legendgroup: name, hoverinfo: 'none' });
            
            // Volatility
            const rollVol = [];
            for (let i = 0; i < slice.length; i++) {
                if (i >= 252) {
                    const win = slice.slice(i-252, i);
                    const avg = win.reduce((a,b)=>a+b,0)/252;
                    rollVol.push(Math.sqrt(win.reduce((a,b)=>a+(b-avg)**2,0)/252*252));
                } else rollVol.push(null);
            }
            traces.vol.push({ x: slicedDates, y: rollVol, name, line: { color, width: 1 }, type: 'scatter', mode: 'lines', legendgroup: name, hoverinfo: 'none' });

            // Leverage
            const levSlice = isCustom ? window.customStrategyResult.leverage.slice(startIndex, endIndex + 1) : globalData.leverage[name].slice(startIndex, endIndex + 1);
            traces.leverage.push({ x: slicedDates, y: levSlice, name, line: { color, width: 2, shape: 'hv' }, type: 'scatter', mode: 'lines', legendgroup: name, hoverinfo: 'none' });

            // Real
            const normalizedInflation = globalData.inflation.slice(startIndex, endIndex+1).map((v,i,a) => v/a[0]);
            traces.real.push({ x: slicedDates, y: chartReturns.map((v,i) => v / normalizedInflation[i]), name, line: { color, width }, type: 'scatter', mode: 'lines', legendgroup: name, hoverinfo: 'none' });

            // Yearly
            const yearLabels = Object.keys(yearlyMap).sort();
            traces.yearly.push({ x: yearLabels, y: yearLabels.map(y => yearlyMap[y] - 1), name, type: 'bar', marker: { color }, legendgroup: name, hoverinfo: 'none' });
        }
    }

    renderTable(metricsArr);
    if (currentTab === 'dashboard') {
        const linLay = cloneLayout(); linLay.yaxis.title = 'Return (%)'; linLay.yaxis.tickformat = '.0%';
        linLay.hovermode = 'x'; 
        linLay.xaxis.showspikes = true; linLay.xaxis.spikemode = 'across'; linLay.xaxis.spikecolor = '#fff'; linLay.xaxis.spikethickness = 1;
        Plotly.react('chart-linear', traces.linear, linLay, PLOTLY_CONFIG);

        const logLayout = cloneLayout(); logLayout.yaxis.type = 'log'; logLayout.yaxis.title = 'Index (Log)';
        logLayout.hovermode = 'x'; logLayout.xaxis.showspikes = true; logLayout.xaxis.spikemode = 'across'; logLayout.xaxis.spikecolor = '#fff'; logLayout.xaxis.spikethickness = 1;
        Plotly.react('chart-log', traces.log, logLayout, PLOTLY_CONFIG);

        const ddLayout = cloneLayout(); ddLayout.yaxis.title = 'Drawdown (%)';
        ddLayout.hovermode = 'x'; ddLayout.xaxis.showspikes = true; ddLayout.xaxis.spikemode = 'across'; ddLayout.xaxis.spikecolor = '#fff'; ddLayout.xaxis.spikethickness = 1;
        Plotly.react('chart-drawdown', traces.drawdown, ddLayout, PLOTLY_CONFIG);

        const volLay = cloneLayout(); volLay.yaxis.title = '1-Year Vol (%)';
        volLay.hovermode = 'x'; volLay.xaxis.showspikes = true; volLay.xaxis.spikemode = 'across'; volLay.xaxis.spikecolor = '#fff'; volLay.xaxis.spikethickness = 1;
        Plotly.react('chart-volatility', traces.vol, volLay, PLOTLY_CONFIG);

        const levLay = cloneLayout(); levLay.yaxis.title = 'Leverage'; levLay.yaxis.range = [0, 4.5];
        levLay.hovermode = 'x'; levLay.xaxis.showspikes = true; levLay.xaxis.spikemode = 'across'; levLay.xaxis.spikecolor = '#fff'; levLay.xaxis.spikethickness = 1;
        Plotly.react('chart-leverage', traces.leverage, levLay, PLOTLY_CONFIG);

        const realLay = cloneLayout(); realLay.yaxis.title = 'Real Growth (Inflation Adjusted)'; realLay.yaxis.type = 'log';
        realLay.hovermode = 'x'; realLay.xaxis.showspikes = true; realLay.xaxis.spikemode = 'across'; realLay.xaxis.spikecolor = '#fff'; realLay.xaxis.spikethickness = 1;
        Plotly.react('chart-real', traces.real, realLay, PLOTLY_CONFIG);

        const yearLay = cloneLayout(); yearLay.yaxis.title = 'Yearly Return (%)'; yearLay.barmode = 'group';
        Plotly.react('chart-yearly', traces.yearly, yearLay, PLOTLY_CONFIG);

        // Initialize tooltip engine for these charts
        initTooltipEngine(['chart-linear', 'chart-log', 'chart-drawdown', 'chart-volatility', 'chart-leverage', 'chart-real']);
    }

    window.allMetrics = metricsArr; // Cache for explorer
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

// ── Explorer ────────────────────────────────────────────────────────
function selectStrategyForExplorer(name) {
    const picker = document.getElementById('explorer-picker');
    picker.value = name;
    updateExplorer();
}

function updateExplorer() {
    const picker = document.getElementById('explorer-picker');
    const comparePicker = document.getElementById('explorer-compare-picker');
    const name = picker.value;
    const compareName = comparePicker.value;
    
    if (!name || !window.allMetrics) return;

    const m = window.allMetrics.find(x => x.Strategy === name);
    if (!m) return;

    document.getElementById('explorer-name').textContent = name;
    
    // Metadata Pills
    const metaContainer = document.getElementById('explorer-meta-pills');
    metaContainer.innerHTML = '';
    const meta = parseStrategy(name);
    
    if (meta.logic === 'Ratchet' || name.includes('BEAST') || name.includes('SCALPEL')) {
        metaContainer.innerHTML += '<span class="pill-badge active">Ratchet Logic</span>';
    } else {
        metaContainer.innerHTML += '<span class="pill-badge">Daily Reset</span>';
    }
    
    if (name.includes('SCALPEL') || name.includes('SHIELD') || name.includes('BEAST')) {
        metaContainer.innerHTML += '<span class="pill-badge trend">Trend Filter Active</span>';
    }
    if (meta.mix === 'Pure') {
        metaContainer.innerHTML += '<span class="pill-badge">Pure Equity</span>';
    }

    // Allocation Matrix Visualizer
    const matrixContainer = document.getElementById('allocation-matrix');
    const weights = globalData.weights[name] || [[100,0,0,0,0],[50,50,0,0,0],[0,100,0,0,0],[0,50,50,0,0],[0,0,100,0,0]];
    
    // Bounds Lookup Fallback (Accurate System Standards)
    const FALLBACK_BOUNDS = {
        'Standard': [0.05, 0.10, 0.20, 0.30],
        'Aggressive': [0.03, 0.07, 0.12, 0.20],
        'Conservative': [0.10, 0.20, 0.35, 0.50],
        'Special BEAST': [0.01, 0.05, 0.09, 0.53],
        'Special SCALPEL': [0.01, 0.05, 0.30, 0.60],
        'Special SHIELD': [0.05, 0.10, 0.39, 0.58],
        'Special': [0.05, 0.10, 0.30, 0.50],
        'Benchmark': [0, 0, 0, 0]
    };

    let b = [0,0,0,0];
    if (name === '🧪 USER CUSTOM LAB') {
        b = [parseFloat(document.getElementById('lab-b1').value), parseFloat(document.getElementById('lab-b2').value), parseFloat(document.getElementById('lab-b3').value), parseFloat(document.getElementById('lab-b4').value)].map(v => v/100);
    } else {
        const cat = name.split(' ')[0];
        const boundsSrc = globalData.bounds || FALLBACK_BOUNDS;
        // Priority: Specific Strategy Name -> Category -> Standard Default
        b = boundsSrc[name] || boundsSrc[cat] || [0.05, 0.10, 0.20, 0.30];
    }

    let tableHtml = `
        <table class="weights-table-explorer">
            <thead>
                <tr>
                    <th>Tier / Drawdown</th>
                    <th>VOO (1x)</th><th>SSO (2x)</th><th>SPYU (4x)</th><th>DJP (Mix)</th><th>BILL (Cash)</th>
                    <th>Effective Leverage</th>
                </tr>
            </thead>
            <tbody>
    `;
    weights.forEach((w, i) => {
        const lev = (w[0]*1 + w[1]*2 + w[2]*4 + w[3]*1);
        // Better Ratio Detection: Check if the sum is closer to 1.0 or 100.0
        const weightSum = w.reduce((sum, val) => sum + val, 0);
        const isRatio = weightSum < 2.0; 
        const factor = isRatio ? 100 : 1;
        const displayLev = isRatio ? lev : lev / 100;

        let rangeStr = "";
        if (i === 0) rangeStr = `0 – ${(b[0]*100).toFixed(1)}%`;
        else if (i === 4) rangeStr = `> ${(b[3]*100).toFixed(1)}%`;
        else rangeStr = `${(b[i-1]*100).toFixed(1)} – ${(b[i]*100).toFixed(1)}%`;

        tableHtml += `
            <tr>
                <td class="tier-highlight">
                    <div style="font-size:0.75rem">TIER ${i}</div>
                    <div style="font-size:0.6rem; opacity:0.7; font-weight:400">${rangeStr}</div>
                </td>
                <td>${(w[0]*factor).toFixed(0)}%</td><td>${(w[1]*factor).toFixed(0)}%</td><td>${(w[2]*factor).toFixed(0)}%</td><td>${(w[3]*factor).toFixed(0)}%</td><td>${(w[4]*factor).toFixed(0)}%</td>
                <td class="lev-high">${displayLev.toFixed(2)}x</td>
            </tr>
        `;
    });
    tableHtml += '</tbody></table>';
    matrixContainer.innerHTML = tableHtml;

    // --- Explorer Charts ---
    const chartReturns = m.cumSeries.slice(1);
    const chartDD = m.ddSeries.slice(1);
    const L = chartReturns.length;
    const startIndex = globalData.dates.length - L;
    const syncedDates = globalData.dates.slice(startIndex);
    const color = m.color;

    // Helper: Comparison Data
    const cObj = compareName ? window.allMetrics.find(x => x.Strategy === compareName) : null;
    const cReturns = cObj ? cObj.cumSeries.slice(cObj.cumSeries.length - L) : null;
    const cDD = cObj ? cObj.ddSeries.slice(cObj.ddSeries.length - L) : null;

    const levFull = (m.Strategy === '🧪 USER CUSTOM LAB' ? window.customStrategyResult.leverage : globalData.leverage[m.Strategy]);
    const levSlice = levFull.slice(startIndex);

    const expBaseLayout = { 
        ...cloneLayout(), 
        margin: { l: 60, r: 20, t: 30, b: 80 }, 
        autosize: true, 
        hoverlabel: { bgcolor: '#1a1d23', font: { color: '#ffffff', size: 12 }, bordercolor: 'var(--accent)' },
        xaxis: { 
            showspikes: true, 
            spikemode: 'across', 
            spikecolor: '#fff', 
            spikethickness: 1 
        }
    };
    const traces = (yPrimary, yCompare, namePrimary, nameCompare, pColor, isBar = false) => {
        const arr = [{ 
            x: syncedDates, y: yPrimary, name: namePrimary, 
            line: { color: pColor, width: 3 }, type: isBar ? 'bar' : 'scatter',
            hoverinfo: 'none' // Disable native
        }];
        if (yCompare) {
            arr.push({ 
                x: syncedDates, y: yCompare, name: nameCompare, 
                line: { color: 'rgba(255,255,255,0.3)', width: 1.5, dash: 'dash' }, 
                marker: { color: 'rgba(255,255,255,0.2)' }, type: isBar ? 'bar' : 'scatter', 
                opacity: 0.7, hoverinfo: 'none' 
            });
        }
        return arr;
    };

    // 1. Linear
    Plotly.react('chart-explorer-linear', traces(chartReturns.map(v => v - 1), cReturns ? cReturns.map(v => v - 1) : null, name, compareName, color), { ...expBaseLayout, yaxis: { title: 'Return (%)', tickformat: '.0%' }, height: 450 }, PLOTLY_CONFIG);

    // 2. Log
    const logLay = { ...expBaseLayout, height: 450 };
    logLay.yaxis.type = 'log'; logLay.yaxis.title = 'Index (Log Scale)'; logLay.yaxis.tickformat = ''; 
    Plotly.react('chart-explorer-log', traces(chartReturns, cReturns, name, compareName, color), logLay, PLOTLY_CONFIG);

    // 3. Drawdown
    Plotly.react('chart-explorer-drawdown', traces(chartDD, cDD, name, compareName, '#ff4d4d'), { ...expBaseLayout, yaxis: { title: 'Drawdown (%)', tickformat: '.1%' }, height: 400 }, PLOTLY_CONFIG);

    // 4. Volatility
    const computeVol = (stratName, sIdx) => {
        const full = (stratName === '🧪 USER CUSTOM LAB' ? window.customStrategyResult.returns : globalData.variants[stratName]);
        return syncedDates.map((_, i) => {
            const absIdx = sIdx + i;
            if (absIdx < 252) return null;
            const win = full.slice(absIdx - 252, absIdx);
            const avg = win.reduce((a, b) => a + b, 0) / 252;
            return Math.sqrt(win.reduce((a, b) => a + (b - avg) ** 2, 0) / 252 * 252);
        });
    };
    const pVol = computeVol(name, startIndex);
    const cVol = compareName ? computeVol(compareName, globalData.dates.length - L) : null;
    Plotly.react('chart-explorer-vol', traces(pVol, cVol, name, compareName, 'var(--orange)'), { ...expBaseLayout, yaxis: { title: '1-Year Vol (%)', tickformat: '.0%' }, height: 400 }, PLOTLY_CONFIG);

    // 5. Leverage
    const cLev = cObj ? (compareName === '🧪 USER CUSTOM LAB' ? window.customStrategyResult.leverage : globalData.leverage[compareName]).slice(globalData.dates.length - L) : null;
    Plotly.react('chart-explorer-leverage', traces(levSlice, cLev, name, compareName, 'var(--blue)'), { ...expBaseLayout, yaxis: { title: 'Leverage', range: [0, 4.5] }, height: 400 }, PLOTLY_CONFIG);

    // 6. Real
    const inflationNorm = globalData.inflation.slice(startIndex).map((v, i, a) => v / a[0]);
    const chartReal = chartReturns.map((v, i) => v / inflationNorm[i]);
    const cReal = cReturns ? cReturns.map((v, i) => v / inflationNorm[i]) : null;
    Plotly.react('chart-explorer-real', traces(chartReal, cReal, name, compareName, 'var(--green)'), { ...expBaseLayout, yaxis: { title: 'Real Growth (Log)', type: 'log' }, height: 450 }, PLOTLY_CONFIG);

    // Initialize custom tooltip for all and hide native
    initTooltipEngine([
        'chart-explorer-linear', 'chart-explorer-log', 'chart-explorer-drawdown', 
        'chart-explorer-vol', 'chart-explorer-leverage', 'chart-explorer-real'
    ]);

    // 7. Yearly
    const getYearly = (stratName, sIdx) => {
        const full = (stratName === '🧪 USER CUSTOM LAB' ? window.customStrategyResult.returns : globalData.variants[stratName]);
        const slice = full.slice(sIdx);
        const map = {};
        slice.forEach((ret, i) => { if (i < syncedDates.length) { const y = syncedDates[i].substring(0, 4); map[y] = (map[y] || 1.0) * (1 + ret); } });
        return map;
    };
    const pYearly = getYearly(name, startIndex);
    const cYearly = compareName ? getYearly(compareName, globalData.dates.length - L) : null;
    const years = Object.keys(pYearly).sort();
    
    const yearlyTraces = [{ x: years, y: years.map(y => pYearly[y] - 1), name, type: 'bar', marker: { color } }];
    if (cYearly) yearlyTraces.push({ x: Object.keys(cYearly).sort(), y: Object.keys(cYearly).sort().map(y => cYearly[y] - 1), name: compareName, type: 'bar', marker: { color: 'rgba(255,255,255,0.2)' } });

    Plotly.react('chart-explorer-yearly', yearlyTraces, { ...expBaseLayout, barmode: 'group', yaxis: { title: 'Yearly Return (%)', tickformat: '.0%' }, height: 450 }, PLOTLY_CONFIG);
}

// ── Simulator ───────────────────────────────────────────────────────
function updateSimulator() {
    const dd = parseFloat(document.getElementById('drawdown-slider').value);
    document.getElementById('drawdown-value').textContent = `-${dd}%`;

    const b1 = parseFloat(document.getElementById('lab-b1').value);
    const b2 = parseFloat(document.getElementById('lab-b2').value);
    const b3 = parseFloat(document.getElementById('lab-b3').value);
    const b4 = parseFloat(document.getElementById('lab-b4').value);

    let dailyTier = 0;
    if (dd >= b4) dailyTier = 4;
    else if (dd >= b3) dailyTier = 3;
    else if (dd >= b2) dailyTier = 2;
    else if (dd >= b1) dailyTier = 1;

    if (dd === 0) simMaxTierReached = 0;
    else if (dailyTier > simMaxTierReached) simMaxTierReached = dailyTier;

    document.getElementById('sim-daily-state').textContent = `Tier ${dailyTier}`;
    document.getElementById('sim-ratchet-state').textContent = `Tier ${simMaxTierReached}`;

    // SVG Updates
    document.querySelectorAll('.flow-node').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.flow-path').forEach(p => p.classList.remove('active'));

    document.getElementById(`node-${dailyTier}`).classList.add('active');
    for (let i = 0; i < dailyTier; i++) {
        document.getElementById(`path-${i}-${i+1}`).classList.add('active');
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
    
    // Force Plotly Resize for the new tab's layout
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 100);
}

// ── Initialization ─────────────────────────────────────────────────
async function init() {
    try {
        const response = await fetch('data/data.json');
        globalData = await response.json();

        // Init Inputs
        const dates = globalData.dates;
        const startInput = document.getElementById('start-date');
        const endInput = document.getElementById('end-date');
        startInput.min = startInput.value = dates[0];
        endInput.max = endInput.value = dates[dates.length - 1];

        // Populate Explorer Pickers
        const picker = document.getElementById('explorer-picker');
        const comparePicker = document.getElementById('explorer-compare-picker');
        Object.keys(globalData.variants).sort().forEach(name => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = name;
            picker.appendChild(opt);
            
            const opt2 = document.createElement('option');
            opt2.value = opt2.textContent = name;
            comparePicker.appendChild(opt2);
        });
        picker.onchange = updateExplorer;
        comparePicker.onchange = updateExplorer;

        // Listeners
        startInput.onchange = update;
        endInput.onchange = update;
        document.getElementById('reset-btn').onclick = () => { startInput.value = dates[0]; endInput.value = dates[dates.length-1]; update(); };
        
        document.querySelectorAll('.pill').forEach(p => p.onclick = () => {
            const group = p.parentElement.id.replace('filter-', '');
            if (p.classList.toggle('active')) activeFilters[group].push(p.dataset.value);
            else activeFilters[group] = activeFilters[group].filter(v => v !== p.dataset.value);
            update();
        });

        document.querySelectorAll('.nav-item').forEach(n => n.onclick = () => switchTab(n.dataset.tab));

        // Simulator
        document.getElementById('drawdown-slider').oninput = updateSimulator;

        // Lab
        renderWeightTable();
        document.getElementById('lab-run').onclick = () => {
            const bounds = [parseFloat(document.getElementById('lab-b1').value), parseFloat(document.getElementById('lab-b2').value), parseFloat(document.getElementById('lab-b3').value), parseFloat(document.getElementById('lab-b4').value)];
            const ratchet = document.getElementById('lab-ratchet').checked;
            const safeties = document.getElementById('lab-safeties').checked;
            const trend = document.getElementById('lab-trend').checked;
            window.customStrategyResult = simulateCustomStrategy(bounds, ratchet, safeties, trend);
            switchTab('dashboard');
            update();
        };

        // Table Sort
        document.querySelectorAll('#metrics-table thead th').forEach(th => th.onclick = () => {
            const key = th.dataset.sort;
            if (key === currentSortKey) currentSortAsc = !currentSortAsc;
            else { currentSortKey = key; currentSortAsc = false; }
            update();
        });

        // Final UI cleanup
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
        const sum = row.VOO + row.SSO + row.SPYU + row.DJP + row.BILL;
        tr.innerHTML = `
            <td style="font-size:0.7rem; font-weight:700">T${i}</td>
            <td><input type="number" data-tier="${i}" data-asset="VOO" value="${row.VOO}" style="width:45px; background:transparent; border:1px solid var(--border); color:#fff; text-align:center;"></td>
            <td><input type="number" data-tier="${i}" data-asset="SSO" value="${row.SSO}" style="width:45px; background:transparent; border:1px solid var(--border); color:#fff; text-align:center;"></td>
            <td><input type="number" data-tier="${i}" data-asset="SPYU" value="${row.SPYU}" style="width:45px; background:transparent; border:1px solid var(--border); color:#fff; text-align:center;"></td>
            <td><input type="number" data-tier="${i}" data-asset="DJP" value="${row.DJP}" style="width:45px; background:transparent; border:1px solid var(--border); color:#fff; text-align:center;"></td>
            <td><input type="number" data-tier="${i}" data-asset="BILL" value="${row.BILL}" style="width:45px; background:transparent; border:1px solid var(--border); color:#fff; text-align:center;"></td>
            <td style="color:${Math.abs(sum-100)<0.1 ? 'var(--green)' : 'var(--red)'}">${sum}%</td>
        `;
        tr.querySelectorAll('input').forEach(inp => inp.oninput = e => {
            labWeights[e.target.dataset.tier][e.target.dataset.asset] = parseFloat(e.target.value) || 0;
            renderWeightTable();
        });
        tbody.appendChild(tr);
    });
}

init();
