/**
 * Strategy Tournament — Dashboard Engine
 * High-performance client-side simulation and visualization.
 * 
 * Architecture:
 *   init() → fetches data.json → wires event listeners → calls update()
 *   update() → slices data → computes metrics → renders table + 7 Plotly charts
 *   simulateCustomStrategy() → runs browser-side backtest from Lab inputs
 */

'use strict';

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
    margin: { l: 50, r: 16, t: 48, b: 40 },
    hovermode: 'x unified',
    xaxis: { gridcolor: 'rgba(255,255,255,0.04)', zeroline: false },
    yaxis: { gridcolor: 'rgba(255,255,255,0.04)', tickformat: '.1%', zeroline: false },
    legend: { orientation: 'h', y: 1.15, x: 0, font: { size: 10, family: 'Inter, sans-serif' } },
    font: { family: 'Inter, sans-serif', color: '#8892b0' }
};

const PLOTLY_CONFIG = { responsive: true, displayModeBar: false };

function cloneLayout() {
    return JSON.parse(JSON.stringify(PLOTLY_LAYOUT));
}

// ── Parsing ────────────────────────────────────────────────────────
function parseStrategy(name) {
    if (name.startsWith('Benchmark')) return { level: 'Benchmark', logic: 'Daily', mix: 'Safeties' };
    if (name.startsWith('Special')) return { level: 'Special', logic: 'Daily', mix: 'Safeties' };
    const parts = name.split(' ');
    return { level: parts[0], logic: parts[1], mix: parts[2] };
}

// ── Lab Simulation Engine ──────────────────────────────────────────
function simulateCustomStrategy(bounds, useRatchet, useSafeties, useTrend) {
    const raw = globalData.raw_returns;
    const n = raw.VOO.length;
    const sma = globalData.signals.sma200;

    // 1. Drawdowns
    let spyCum = 1.0, spyAth = 1.0;
    const dds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        spyCum *= (1 + raw.VOO[i]);
        if (spyCum > spyAth) spyAth = spyCum;
        dds[i] = (spyCum - spyAth) / spyAth;
    }

    // 2. Tiers
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

    // 3. Returns & Leverage
    const results = new Float32Array(n);
    const leverage = new Float32Array(n);

    const normWeights = labWeights.map(row => {
        const sum = (row.VOO + row.SSO + row.SPYU + row.DJP + row.BILL) || 100;
        return {
            VOO: row.VOO / sum, SSO: row.SSO / sum, SPYU: row.SPYU / sum,
            DJP: row.DJP / sum, BILL: row.BILL / sum
        };
    });

    for (let i = 0; i < n; i++) {
        const w = normWeights[tiers[i]];
        results[i] = raw.VOO[i] * w.VOO + raw.SSO[i] * w.SSO + raw.SPYU[i] * w.SPYU +
                     raw.DJP[i] * w.DJP + raw.BILL[i] * w.BILL;
        leverage[i] = w.VOO + w.SSO * 2 + w.SPYU * 4 + w.DJP;
    }

    return { returns: results, leverage };
}

// ── Main Update Loop ───────────────────────────────────────────────
function update() {
    const start = document.getElementById('start-date').value;
    const end = document.getElementById('end-date').value;

    const startIndex = globalData.dates.findIndex(d => d >= start);
    const endIndex = globalData.dates.findLastIndex(d => d <= end);

    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) return;

    const slicedDates = globalData.dates.slice(startIndex, endIndex + 1);
    const years = (new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24 * 365.25);

    // Active non-benchmark strategies for adaptive coloring
    const activeStrategyNames = Object.keys(globalData.variants).filter(name => {
        if (name.startsWith('Benchmark')) return false;
        const meta = parseStrategy(name);
        return activeFilters.level.includes(meta.level) &&
               activeFilters.logic.includes(meta.logic) &&
               activeFilters.mix.includes(meta.mix);
    });

    const traces = { linear: [], log: [], drawdown: [], vol: [], yearly: [], leverage: [], real: [] };
    const metricsArr = [];

    // Inflation
    const rangeInflation = globalData.inflation.slice(startIndex, endIndex + 1);
    const inflationBase = rangeInflation[0];
    const normalizedInflation = rangeInflation.map(v => v / inflationBase);

    traces.log.push({
        x: slicedDates, y: normalizedInflation, name: 'Inflation (CPI)',
        line: { color: BENCHMARK_COLORS['Inflation (CPI)'], width: 2, dash: 'dot' },
        type: 'scatter', mode: 'lines'
    });

    // Merge precomputed + custom lab
    const allVariants = { ...globalData.variants };
    if (window.customStrategyResult) {
        allVariants['🧪 USER CUSTOM LAB'] = window.customStrategyResult.returns;
    }

    for (const [name, returns] of Object.entries(allVariants)) {
        const isCustom = name === '🧪 USER CUSTOM LAB';
        const customReturns = isCustom ? window.customStrategyResult?.returns : null;
        if (isCustom && !customReturns) continue;

        let color, meta;
        if (isCustom) {
            color = '#39ff14';
            meta = { level: 'Lab', logic: 'Custom', mix: 'User' };
        } else {
            meta = parseStrategy(name);
            if (meta.level === 'Benchmark' || meta.level === 'Special') {
                if (!activeFilters.level.includes(meta.level)) continue;
                color = BENCHMARK_COLORS[name];
            } else {
                if (!activeFilters.level.includes(meta.level) ||
                    !activeFilters.logic.includes(meta.logic) ||
                    !activeFilters.mix.includes(meta.mix)) continue;
                color = getAdaptiveColor(activeStrategyNames.indexOf(name), activeStrategyNames.length);
            }
        }

        const slice = isCustom ? customReturns.slice(startIndex, endIndex + 1) : returns.slice(startIndex, endIndex + 1);
        const levSlice = isCustom
            ? window.customStrategyResult.leverage.slice(startIndex, endIndex + 1)
            : globalData.leverage[name].slice(startIndex, endIndex + 1);
        const width = (isCustom || name.includes('Ratchet') || name.includes('Standard')) ? 2.5 : 1.5;

        // Compute metrics
        let cum = 1.0, maxVal = 1.0, maxDD = 0, sumReturn = 0;
        const cumSeries = [1.0];
        const ddSeries = [0.0];
        const rollingVolSeries = [];
        const volWindow = 252;
        const yearlyMap = {};

        for (let i = 0; i < slice.length; i++) {
            const ret = slice[i];
            cum *= (1 + ret);
            cumSeries.push(cum);
            if (cum > maxVal) maxVal = cum;
            const dd = (cum - maxVal) / maxVal;
            if (dd < maxDD) maxDD = dd;
            ddSeries.push(dd);
            sumReturn += ret;

            if (i >= volWindow) {
                const windowReturns = slice.slice(i - volWindow, i);
                const mean = windowReturns.reduce((a, b) => a + b, 0) / volWindow;
                const variance = windowReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (volWindow - 1);
                rollingVolSeries.push(Math.sqrt(variance * 252));
            } else {
                rollingVolSeries.push(null);
            }

            const year = slicedDates[i].split('-')[0];
            if (!yearlyMap[year]) yearlyMap[year] = 1.0;
            yearlyMap[year] *= (1 + ret);
        }

        const cagr = Math.pow(Math.max(1e-8, cum), 1 / years) - 1;
        const avgAnnRet = (sumReturn / slice.length) * 252;
        const mean = sumReturn / slice.length;
        const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / (slice.length - 1);
        const vol = Math.sqrt(variance * 252);
        const sharpe = vol > 0.001 ? (cagr - 0.02) / vol : 0;

        metricsArr.push({
            Strategy: name, 'Total %': cum - 1, CAGR: cagr,
            'Avg Ann Ret': avgAnnRet, 'Max DD': maxDD, Sharpe: sharpe, 'Ann. Vol': vol
        });

        // Build traces
        const traceBase = { name, legendgroup: name, type: 'scatter', mode: 'lines' };

        traces.linear.push({ ...traceBase, x: slicedDates, y: cumSeries.map(v => v - 1), line: { color, width } });
        traces.log.push({ ...traceBase, x: slicedDates, y: cumSeries.map(v => Math.max(1e-6, v)), line: { color, width } });
        traces.drawdown.push({ ...traceBase, x: slicedDates, y: ddSeries, line: { color, width: 1.5 }, fill: 'tonexty' });
        traces.vol.push({ ...traceBase, x: slicedDates, y: rollingVolSeries, line: { color, width: 1.5 } });
        traces.leverage.push({ ...traceBase, x: slicedDates, y: levSlice, line: { color, width: 2, shape: 'hv' } });

        const yearLabels = Object.keys(yearlyMap).sort();
        traces.yearly.push({
            x: yearLabels, y: yearLabels.map(y => yearlyMap[y] - 1),
            name, legendgroup: name, type: 'bar', marker: { color }
        });

        traces.real.push({
            ...traceBase, x: slicedDates,
            y: cumSeries.map((v, i) => v / normalizedInflation[i]),
            line: { color, width }
        });
    }

    renderTable(metricsArr);
    renderCharts(traces);
}

// ── Table Renderer ─────────────────────────────────────────────────
function renderTable(metrics) {
    const tbody = document.getElementById('metrics-body');
    tbody.innerHTML = '';

    metrics.sort((a, b) => {
        const aVal = a[currentSortKey], bVal = b[currentSortKey];
        if (typeof aVal === 'string') return currentSortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        return currentSortAsc ? aVal - bVal : bVal - aVal;
    });

    const frag = document.createDocumentFragment();
    for (const m of metrics) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600">${m.Strategy}</td>
            <td style="color:${m['Total %'] >= 0 ? 'var(--green)' : 'var(--red)'}">${(m['Total %'] * 100).toFixed(1)}%</td>
            <td>${(m.CAGR * 100).toFixed(1)}%</td>
            <td>${(m['Avg Ann Ret'] * 100).toFixed(1)}%</td>
            <td style="color:var(--red)">${(m['Max DD'] * 100).toFixed(1)}%</td>
            <td>${m.Sharpe.toFixed(2)}</td>
            <td>${(m['Ann. Vol'] * 100).toFixed(1)}%</td>
        `;
        frag.appendChild(tr);
    }
    tbody.appendChild(frag);

    // Sort arrows
    document.querySelectorAll('#metrics-table thead th').forEach(th => {
        const key = th.getAttribute('data-sort');
        const arrow = key === currentSortKey ? (currentSortAsc ? ' ▲' : ' ▼') : '';
        th.textContent = th.textContent.replace(/ [▲▼]$/, '') + arrow;
    });
}

// ── Chart Renderer ─────────────────────────────────────────────────
function renderCharts(traces) {
    const linear = cloneLayout();
    linear.yaxis.title = 'Return (%)';
    linear.yaxis.tickformat = '.0%';
    Plotly.react('chart-linear', traces.linear, linear, PLOTLY_CONFIG);

    const log = cloneLayout();
    log.yaxis = { ...log.yaxis, title: 'Growth (Log)', type: 'log', tickformat: '.1f' };
    Plotly.react('chart-log', traces.log, log, PLOTLY_CONFIG);

    const dd = cloneLayout();
    dd.yaxis.title = 'Drawdown (%)';
    Plotly.react('chart-drawdown', traces.drawdown, dd, PLOTLY_CONFIG);

    const vol = cloneLayout();
    vol.yaxis.title = '1-Year Vol (%)';
    Plotly.react('chart-volatility', traces.vol, vol, PLOTLY_CONFIG);

    const yearly = cloneLayout();
    yearly.yaxis.title = 'Yearly Return (%)';
    yearly.barmode = 'group';
    yearly.xaxis.tickangle = -45;
    Plotly.react('chart-yearly', traces.yearly, yearly, PLOTLY_CONFIG);

    const lev = cloneLayout();
    lev.yaxis = { ...lev.yaxis, title: 'Effective Multiplier', tickformat: '.1f', range: [0, 4.5] };
    Plotly.react('chart-leverage', traces.leverage, lev, PLOTLY_CONFIG);

    const real = cloneLayout();
    real.yaxis = { ...real.yaxis, title: 'Growth of $1 (Real)', type: 'log', tickformat: '.1f' };
    Plotly.react('chart-real', traces.real, real, PLOTLY_CONFIG);
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
        startInput.max = endInput.max = dates[dates.length - 1];
        endInput.min = dates[0];
        endInput.value = dates[dates.length - 1];

        startInput.addEventListener('change', update);
        endInput.addEventListener('change', update);

        document.getElementById('reset-btn').addEventListener('click', () => {
            startInput.value = dates[0];
            endInput.value = dates[dates.length - 1];
            update();
        });

        // Filter pills
        document.querySelectorAll('.pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const group = pill.parentElement.id.replace('filter-', '');
                const val = pill.dataset.value;
                if (pill.classList.toggle('active')) {
                    activeFilters[group].push(val);
                } else {
                    activeFilters[group] = activeFilters[group].filter(v => v !== val);
                }
                update();
            });
        });

        // Table sort
        document.querySelectorAll('#metrics-table thead th').forEach(th => {
            th.addEventListener('click', () => {
                const key = th.dataset.sort;
                if (!key) return;
                if (key === currentSortKey) { currentSortAsc = !currentSortAsc; }
                else { currentSortKey = key; currentSortAsc = false; }
                update();
            });
        });

        // Lab persistence
        const savedLab = localStorage.getItem('tournament_lab_settings');
        if (savedLab) {
            const s = JSON.parse(savedLab);
            document.getElementById('lab-b1').value = s.bounds[0];
            document.getElementById('lab-b2').value = s.bounds[1];
            document.getElementById('lab-b3').value = s.bounds[2];
            document.getElementById('lab-b4').value = s.bounds[3];
            document.getElementById('lab-ratchet').checked = s.ratchet;
            document.getElementById('lab-safeties').checked = s.safeties;
            document.getElementById('lab-trend').checked = s.trend;
            window.customStrategyResult = simulateCustomStrategy(s.bounds, s.ratchet, s.safeties, s.trend);
        }

        const savedWeights = localStorage.getItem('tournament_lab_weights');
        if (savedWeights) labWeights = JSON.parse(savedWeights);

        // Weight modal
        const modal = document.getElementById('modal-weights');
        const weightBody = document.getElementById('weight-tbody');

        function renderWeightTable() {
            weightBody.innerHTML = '';
            const frag = document.createDocumentFragment();
            labWeights.forEach((row, i) => {
                const tr = document.createElement('tr');
                const sum = row.VOO + row.SSO + row.SPYU + row.DJP + row.BILL;
                tr.innerHTML = `
                    <td style="font-size:0.8rem;font-weight:700;color:var(--text-muted)">Tier ${i}</td>
                    <td><input type="number" data-tier="${i}" data-asset="VOO" value="${row.VOO}"></td>
                    <td><input type="number" data-tier="${i}" data-asset="SSO" value="${row.SSO}"></td>
                    <td><input type="number" data-tier="${i}" data-asset="SPYU" value="${row.SPYU}"></td>
                    <td><input type="number" data-tier="${i}" data-asset="DJP" value="${row.DJP}"></td>
                    <td><input type="number" data-tier="${i}" data-asset="BILL" value="${row.BILL}"></td>
                    <td class="row-total ${Math.abs(sum - 100) < 0.1 ? 'total-ok' : 'total-bad'}">${sum}%</td>
                `;
                tr.querySelectorAll('input').forEach(inp => {
                    inp.addEventListener('input', e => {
                        labWeights[e.target.dataset.tier][e.target.dataset.asset] = parseFloat(e.target.value) || 0;
                        renderWeightTable();
                    });
                });
                frag.appendChild(tr);
            });
            weightBody.appendChild(frag);
        }

        document.getElementById('lab-config-btn').addEventListener('click', () => {
            modal.style.display = 'flex';
            renderWeightTable();
        });
        document.getElementById('close-modal').addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('modal-cancel').addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('modal-save').addEventListener('click', () => {
            localStorage.setItem('tournament_lab_weights', JSON.stringify(labWeights));
            modal.style.display = 'none';
        });

        // Lab run
        document.getElementById('lab-run').addEventListener('click', () => {
            const bounds = [
                parseFloat(document.getElementById('lab-b1').value),
                parseFloat(document.getElementById('lab-b2').value),
                parseFloat(document.getElementById('lab-b3').value),
                parseFloat(document.getElementById('lab-b4').value)
            ];
            const ratchet = document.getElementById('lab-ratchet').checked;
            const safeties = document.getElementById('lab-safeties').checked;
            const trend = document.getElementById('lab-trend').checked;
            localStorage.setItem('tournament_lab_settings', JSON.stringify({ bounds, ratchet, safeties, trend }));
            window.customStrategyResult = simulateCustomStrategy(bounds, ratchet, safeties, trend);
            update();
        });

        // Fade out loader
        const loader = document.getElementById('loader');
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 300);

        update();
    } catch (e) {
        console.error('Failed to initialize:', e);
        const loader = document.getElementById('loader');
        loader.querySelector('.loading-spinner').style.display = 'none';
        loader.querySelector('.loading-text').textContent = 'Error loading data. Ensure you are using a local server.';
    }
}

// Wait for Plotly to be ready (since it's loaded with defer)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof Plotly !== 'undefined') init();
        else window.addEventListener('load', init);
    });
} else {
    if (typeof Plotly !== 'undefined') init();
    else window.addEventListener('load', init);
}
