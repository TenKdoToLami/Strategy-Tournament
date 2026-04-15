// Filter State
const activeFilters = {
    level: ['Benchmark', 'Standard', 'Aggressive', 'Conservative'],
    logic: ['Daily', 'Ratchet'],
    mix: ['Safeties', 'Pure']
};

// Color mapping for persistence
const colors = ['#ff9900', '#00ffcc', '#dc3912', '#3366cc', '#ff00ff', '#109618', '#00bfff', '#990099', '#f2f2f2', '#8da0cb', '#66c2a5', '#fc8d62', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'];
let strategyColorMap = {};

async function init() {
    try {
        const response = await fetch('data.json');
        globalData = await response.json();
        
        // Pre-assign colors
        Object.keys(globalData.variants).forEach((name, i) => {
            strategyColorMap[name] = colors[i % colors.length];
        });

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

        document.getElementById('loader').style.display = 'none';
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
    
    const linearTraces = [];
    const logTraces = [];
    const drawdownTraces = [];
    const volTraces = [];
    const yearlyTraces = [];
    const metricsArr = [];

    for (const [name, returns] of Object.entries(globalData.variants)) {
        // Filter Check
        const meta = parseStrategy(name);
        if (!activeFilters.level.includes(meta.level)) continue;
        if (!activeFilters.logic.includes(meta.logic)) continue;
        if (!activeFilters.mix.includes(meta.mix)) continue;

        const slice = returns.slice(startIndex, endIndex + 1);
        const color = strategyColorMap[name];
        const width = (name.includes('Ratchet') || name.includes('Standard')) ? 3 : 1.5;

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

        const yearLabels = Object.keys(yearlyMap).sort();
        const yearVals = yearLabels.map(y => yearlyMap[y] - 1);
        yearlyTraces.push({
            x: yearLabels, y: yearVals, name: name, legendgroup: name,
            type: 'bar', marker: {color: color}, showlegend: true
        });

    }

    renderTable(metricsArr);
    renderAdvancedCharts(linearTraces, logTraces, drawdownTraces, volTraces, yearlyTraces);
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

function renderAdvancedCharts(linearTraces, logTraces, drawdownTraces, volTraces, yearlyTraces) {
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
}

init();
