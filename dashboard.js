// Filter State
const activeFilters = {
    level: ['Benchmark', 'Standard', 'Aggressive', 'Conservative'],
    logic: ['Daily', 'Ratchet'],
    mix: ['Safeties', 'Pure']
};

// Benchmark Anchors (Stable Colors)
const benchmarkColors = {
    'Benchmark SPY (1x)': '#ffcc00',      // Gold
    'Benchmark SSO (2x)': '#ff4d4d',      // Red-Orange
    'Benchmark SPYU (4x)': '#cc0000',      // Deep Red
    'Benchmark DJP (1x)': '#00cc99',       // Teal
    'Inflation (CPI)': '#8892b0'           // Gray
};

function getAdaptiveColor(index, total) {
    if (total === 0) return '#ffffff';
    // Use HSL for maximum visual distinction (evenly spaced hues)
    const hue = (index * 360) / total;
    return `hsl(${hue}, 75%, 60%)`;
}

async function init() {
    try {
        const response = await fetch('data.json');
        globalData = await response.json();
        
        const dates = globalData.dates;
        const startInput = document.getElementById('start-date');
        const endInput = document.getElementById('end-date');
        
        startInput.min = dates[0];
        startInput.max = dates[dates.length-1];
        endInput.min = dates[0];
        endInput.max = dates[dates.length-1];
        
        startInput.value = dates[0];
        endInput.value = dates[dates.length-1];
        
        startInput.addEventListener('change', update);
        endInput.addEventListener('change', update);
        document.getElementById('reset-btn').addEventListener('click', () => {
            startInput.value = dates[0];
            endInput.value = dates[dates.length-1];
            update();
        });

        // Toggle Filter Logic
        document.querySelectorAll('.pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const group = pill.parentElement.id.replace('filter-', '');
                const val = pill.getAttribute('data-value');
                
                if (pill.classList.contains('active')) {
                    pill.classList.remove('active');
                    activeFilters[group] = activeFilters[group].filter(v => v !== val);
                } else {
                    pill.classList.add('active');
                    activeFilters[group].push(val);
                }
                update();
            });
        });

        // Load Lab Persistence
        const savedLab = localStorage.getItem('tournament_lab_settings');
        if (savedLab) {
            const settings = JSON.parse(savedLab);
            document.getElementById('lab-b1').value = settings.bounds[0];
            document.getElementById('lab-b2').value = settings.bounds[1];
            document.getElementById('lab-b3').value = settings.bounds[2];
            document.getElementById('lab-b4').value = settings.bounds[3];
            document.getElementById('lab-ratchet').checked = settings.ratchet;
            document.getElementById('lab-safeties').checked = settings.safeties;
            document.getElementById('lab-trend').checked = settings.trend;
            
            // Auto-run if settings exist
            window.customStrategyResult = simulateCustomStrategy(settings.bounds, settings.ratchet, settings.safeties, settings.trend);
        }

        document.getElementById('loader').style.display = 'none';
        
        // Lab Run Button
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
            
            // Save to localStorage
            localStorage.setItem('tournament_lab_settings', JSON.stringify({
                bounds, ratchet, safeties, trend
            }));

            window.customStrategyResult = simulateCustomStrategy(bounds, ratchet, safeties, trend);
            update();
        });

        update();
    } catch (e) {
        console.error("Error loading data:", e);
        document.getElementById('loader').innerText = "Error loading data.json . Make sure you are using a local server.";
    }
}

function parseStrategy(name) {
    if (name.startsWith('Benchmark')) {
        return { level: 'Benchmark', logic: 'Daily', mix: 'Safeties' };
    }
    const parts = name.split(' ');
    // Format: "Level Logic Mix" e.g. "Standard Ratchet Pure"
    return {
        level: parts[0],
        logic: parts[1],
        mix: parts[2]
    };
}

function simulateCustomStrategy(bounds, useRatchet, useSafeties, useTrend) {
    const raw = globalData.raw_returns;
    const n = raw.VOO.length;
    const sma = globalData.signals.sma200;
    
    // 1. Calculate Daily Drawdowns for VOO
    let spyCum = 1.0;
    let spyAth = 1.0;
    const dds = new Float32Array(n);
    for(let i=0; i<n; i++) {
        spyCum *= (1 + raw.VOO[i]);
        if (spyCum > spyAth) spyAth = spyCum;
        dds[i] = (spyCum - spyAth) / spyAth;
    }

    // 2. Determine Tiers
    const tiers = new Int8Array(n);
    let currentMaxTier = 0;
    for (let i = 0; i < n; i++) {
        if (i === 0) continue;
        const yDD = dds[i-1];
        const ySMA = sma[i-1];
        
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

    // 3. Calculate Returns & Leverage
    const results = new Float32Array(n);
    const leverage = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const t = tiers[i];
        if (useSafeties) {
            if (t === 0) { results[i] = raw.VOO[i]*0.8 + raw.DJP[i]*0.1 + raw.BILL[i]*0.1; leverage[i] = 0.8; }
            else if (t === 1) { results[i] = raw.VOO[i]*0.6 + raw.SSO[i]*0.2 + raw.DJP[i]*0.1 + raw.BILL[i]*0.1; leverage[i] = 1.0; }
            else if (t === 2) { results[i] = raw.VOO[i]*0.3 + raw.SSO[i]*0.25 + raw.SPYU[i]*0.25 + raw.DJP[i]*0.1 + raw.BILL[i]*0.1; leverage[i] = 1.8; }
            else if (t === 3) { results[i] = raw.VOO[i]*0.1 + raw.SSO[i]*0.35 + raw.SPYU[i]*0.35 + raw.DJP[i]*0.1 + raw.BILL[i]*0.1; leverage[i] = 2.2; }
            else { results[i] = raw.SSO[i]*0.5 + raw.SPYU[i]*0.5; leverage[i] = 3.0; }
        } else {
            if (t === 0) { results[i] = raw.VOO[i]; leverage[i] = 1.0; }
            else if (t === 1) { results[i] = raw.VOO[i]*0.75 + raw.SSO[i]*0.25; leverage[i] = 1.25; }
            else if (t === 2) { results[i] = raw.VOO[i]*0.38 + raw.SSO[i]*0.31 + raw.SPYU[i]*0.31; leverage[i] = 2.25; }
            else if (t === 3) { results[i] = raw.VOO[i]*0.12 + raw.SSO[i]*0.44 + raw.SPYU[i]*0.44; leverage[i] = 2.75; }
            else { results[i] = raw.SSO[i]*0.5 + raw.SPYU[i]*0.5; leverage[i] = 3.0; }
        }
    }
    return { returns: results, leverage: leverage };
}

function update() {
    const start = document.getElementById('start-date').value;
    const end = document.getElementById('end-date').value;
    
    const startIndex = globalData.dates.findIndex(d => d >= start);
    const endIndex = globalData.dates.findLastIndex(d => d <= end);
    
    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
        console.warn("Invalid date range");
        return;
    }

    const slicedDates = globalData.dates.slice(startIndex, endIndex + 1);
    const years = (new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24 * 365.25);
    
    // 1. Identify active strategies (excluding benchmarks) for adaptive coloring
    const activeStrategyNames = Object.keys(globalData.variants).filter(name => {
        if (name.startsWith('Benchmark')) return false;
        const meta = parseStrategy(name);
        return activeFilters.level.includes(meta.level) && 
               activeFilters.logic.includes(meta.logic) && 
               activeFilters.mix.includes(meta.mix);
    });
    
    const linearTraces = [];
    const logTraces = [];
    const drawdownTraces = [];
    const volTraces = [];
    const yearlyTraces = [];
    const leverageTraces = [];
    const realTraces = [];
    const metricsArr = [];

    // Inflation normalization for the current range
    const rangeInflation = globalData.inflation.slice(startIndex, endIndex + 1);
    const inflationBase = rangeInflation[0];
    const normalizedInflation = rangeInflation.map(v => v / inflationBase);

    // Add Inflation Benchmark to Growth charts
    const inflationTrace = {
        x: slicedDates, y: normalizedInflation, name: 'Inflation (CPI)',
        line: {color: benchmarkColors['Inflation (CPI)'], width: 2, dash: 'dot'}, type: 'scatter', mode: 'lines'
    };
    linearTraces.push(JSON.parse(JSON.stringify(inflationTrace)));
    logTraces.push(JSON.parse(JSON.stringify(inflationTrace)));

    // Merger variants with custom lab
    const allVariants = {...globalData.variants};
    if (window.customStrategyResult) {
        allVariants['🧪 USER CUSTOM LAB'] = window.customStrategyResult.returns;
    }

    for (const [name, returns] of Object.entries(allVariants)) {
        const isCustom = (name === '🧪 USER CUSTOM LAB');
        
        let color, meta;
        if (isCustom) {
            color = '#39ff14'; // Neon green
            meta = { level: 'Lab', logic: 'Custom', mix: 'User' };
        } else {
            meta = parseStrategy(name);
            if (meta.level === 'Benchmark') {
                if (!activeFilters.level.includes('Benchmark')) continue;
                color = benchmarkColors[name];
            } else {
                if (!activeFilters.level.includes(meta.level)) continue;
                if (!activeFilters.logic.includes(meta.logic)) continue;
                if (!activeFilters.mix.includes(meta.mix)) continue;
                
                const strategyIdx = activeStrategyNames.indexOf(name);
                color = getAdaptiveColor(strategyIdx, activeStrategyNames.length);
            }
        }

        const slice = isCustom ? returns.slice(startIndex, endIndex + 1) : returns.slice(startIndex, endIndex + 1);
        const levSlice = isCustom ? window.customStrategyResult.leverage.slice(startIndex, endIndex + 1) : globalData.leverage[name].slice(startIndex, endIndex + 1);
        const width = (isCustom || name.includes('Ratchet') || name.includes('Standard')) ? 3 : 1.5;

        // 1. Growth & Metrics Calculation
        let cum = 1.0;
        const cumSeries = [1.0];
        let maxVal = 1.0;
        let maxDD = 0.0;
        const ddSeries = [0.0];
        let sumReturn = 0;
        
        const rollingVolSeries = [];
        const volWindow = 252;
        const yearlyMap = {};

        for (let i = 0; i < slice.length; i++) {
            const ret = slice[i];
            const dateStr = slicedDates[i];
            const year = dateStr.split('-')[0];

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
                const variance = windowReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (volWindow - 1);
                rollingVolSeries.push(Math.sqrt(variance) * Math.sqrt(252));
            } else {
                rollingVolSeries.push(null);
            }

            if (!yearlyMap[year]) yearlyMap[year] = 1.0;
            yearlyMap[year] *= (1 + ret);
        }

        const finalVal = cum;
        const cagr = Math.pow(Math.max(1e-8, finalVal), 1/years) - 1;
        const avgAnnRet = (sumReturn / slice.length) * 252;
        
        const mean = sumReturn / slice.length;
        const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (slice.length - 1);
        const vol = Math.sqrt(variance) * Math.sqrt(252);
        const sharpe = (vol > 0.001) ? (cagr - 0.02) / vol : 0;

        metricsArr.push({
            "Strategy": name, "Total %": finalVal - 1, "CAGR": cagr, "Avg Ann Ret": avgAnnRet,
            "Max DD": maxDD, "Sharpe": sharpe, "Ann. Vol": vol
        });

        // 2. Add Traces (Unified Legend Group)
        linearTraces.push({
            x: slicedDates, y: cumSeries.map(v => v - 1), name: name, legendgroup: name,
            type: 'scatter', mode: 'lines', line: {color: color, width: width}
        });

        logTraces.push({
            x: slicedDates, y: cumSeries.map(v => Math.max(1e-6, v)), name: name, legendgroup: name,
            type: 'scatter', mode: 'lines', line: {color: color, width: width}, showlegend: true
        });

        drawdownTraces.push({
            x: slicedDates, y: ddSeries, name: name, legendgroup: name,
            type: 'scatter', mode: 'lines', line: {color: color, width: 1.5}, fill: 'tonexty', showlegend: true
        });

        volTraces.push({
            x: slicedDates, y: rollingVolSeries, name: name, legendgroup: name,
            type: 'scatter', mode: 'lines', line: {color: color, width: 1.5}, showlegend: true
        });

        leverageTraces.push({
            x: slicedDates, y: levSlice, name: name, legendgroup: name,
            type: 'scatter', mode: 'lines', line: {color: color, width: 2, shape: 'hv'}, showlegend: true
        });

        const yearLabels = Object.keys(yearlyMap).sort();
        const yearVals = yearLabels.map(y => yearlyMap[y] - 1);
        yearlyTraces.push({
            x: yearLabels, y: yearVals, name: name, legendgroup: name,
            type: 'bar', marker: {color: color}, showlegend: true
        });

        // 3. Real Returns (Nominal Growth / Inflation Multiplier)
        const realSeries = cumSeries.map((v, i) => v / normalizedInflation[i]);
        realTraces.push({
            x: slicedDates, y: realSeries, name: name, legendgroup: name,
            type: 'scatter', mode: 'lines', line: {color: color, width: width}, showlegend: true
        });
    }

    renderTable(metricsArr);
    renderAdvancedCharts(linearTraces, logTraces, drawdownTraces, volTraces, yearlyTraces, leverageTraces, realTraces);
}

// Sorting state
let currentSortKey = 'CAGR';
let currentSortAsc = false; // descending by default

function renderTable(metrics) {
    const tbody = document.getElementById('metrics-body');
    tbody.innerHTML = '';
    
    // Sort by current key
    metrics.sort((a, b) => {
        const aVal = a[currentSortKey];
        const bVal = b[currentSortKey];
        if (typeof aVal === 'string') {
            return currentSortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return currentSortAsc ? aVal - bVal : bVal - aVal;
    });

    metrics.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:bold">${m.Strategy}</td>
            <td style="color:${m["Total %"] >= 0 ? '#00ffcc' : '#ff4444'}">${(m["Total %"] * 100).toFixed(1)}%</td>
            <td>${(m.CAGR * 100).toFixed(1)}%</td>
            <td>${(m["Avg Ann Ret"] * 100).toFixed(1)}%</td>
            <td style="color:#ff4444">${(m["Max DD"] * 100).toFixed(1)}%</td>
            <td>${m.Sharpe.toFixed(2)}</td>
            <td>${(m["Ann. Vol"] * 100).toFixed(1)}%</td>
        `;
        tbody.appendChild(tr);
    });

    // Update header arrows
    document.querySelectorAll('#metrics-table thead th').forEach(th => {
        const key = th.getAttribute('data-sort');
        const arrow = key === currentSortKey ? (currentSortAsc ? ' ▲' : ' ▼') : '';
        // Strip old arrow and re-add
        const baseText = th.textContent.replace(/ [▲▼]$/, '');
        th.textContent = baseText + arrow;
    });
}

// Attach sort handlers to table headers
document.addEventListener('DOMContentLoaded', () => {
    const tableHeaders = document.querySelectorAll('#metrics-table thead th');
    if (tableHeaders.length > 0) {
        tableHeaders.forEach(th => {
            th.addEventListener('click', () => {
                const key = th.getAttribute('data-sort');
                if (!key) return;
                if (key === currentSortKey) {
                    currentSortAsc = !currentSortAsc;
                } else {
                    currentSortKey = key;
                    currentSortAsc = false;
                }
                update();
            });
        });
    }
});

function renderAdvancedCharts(linearTraces, logTraces, drawdownTraces, volTraces, yearlyTraces, leverageTraces, realTraces) {
    const commonLayout = {
        template: 'plotly_dark',
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        margin: {l: 50, r: 20, t: 80, b: 20}, // More top margin for legends
        hovermode: 'x unified',
        xaxis: { gridcolor: '#2c313c' },
        yaxis: { gridcolor: '#2c313c', tickformat: '.1%' },
        legend: { orientation: 'h', y: 1.25, x: 0, font: { size: 10 } }
    };

    // 1. Linear Performance
    const linearLayout = JSON.parse(JSON.stringify(commonLayout));
    linearLayout.yaxis.title = 'Return (%)';
    linearLayout.yaxis.tickformat = '.0%';
    Plotly.newPlot('chart-linear', linearTraces, linearLayout, {responsive: true});

    // 2. Log Performance
    const logLayout = JSON.parse(JSON.stringify(commonLayout));
    logLayout.yaxis.title = 'Growth (Log Scale)';
    logLayout.yaxis.type = 'log';
    logLayout.yaxis.tickformat = '.1f';
    Plotly.newPlot('chart-log', logTraces, logLayout, {responsive: true});

    // 3. Drawdown
    const ddLayout = JSON.parse(JSON.stringify(commonLayout));
    ddLayout.yaxis.title = 'Drawdown (%)';
    Plotly.newPlot('chart-drawdown', drawdownTraces, ddLayout, {responsive: true});

    // 4. Volatility
    const volLayout = JSON.parse(JSON.stringify(commonLayout));
    volLayout.yaxis.title = '1-Year Vol (%)';
    Plotly.newPlot('chart-volatility', volTraces, volLayout, {responsive: true});

    // 5. Yearly
    const yearlyLayout = JSON.parse(JSON.stringify(commonLayout));
    yearlyLayout.yaxis.title = 'Yearly Return (%)';
    yearlyLayout.barmode = 'group';
    yearlyLayout.xaxis.tickangle = -45;
    Plotly.newPlot('chart-yearly', yearlyTraces, yearlyLayout, {responsive: true});

    // 6. Leverage Progression
    const levLayout = JSON.parse(JSON.stringify(commonLayout));
    levLayout.yaxis.title = 'Effective Multiplier';
    levLayout.yaxis.tickformat = '.1f';
    levLayout.yaxis.range = [0.5, 4.5]; // Fixed range for better comparison
    Plotly.newPlot('chart-leverage', leverageTraces, levLayout, {responsive: true});

    // 7. Real Performance
    const realLayout = JSON.parse(JSON.stringify(commonLayout));
    realLayout.yaxis.title = 'Growth of $1.00 (Inflation Adjusted)';
    realLayout.yaxis.type = 'log';
    realLayout.yaxis.tickformat = '.1f';
    Plotly.newPlot('chart-real', realTraces, realLayout, {responsive: true});
}

init();
