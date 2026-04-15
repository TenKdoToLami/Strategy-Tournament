let globalData = null;

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

        document.getElementById('loader').style.display = 'none';
        update();
    } catch (e) {
        console.error("Error loading data:", e);
        document.getElementById('loader').innerText = "Error loading data.json . Make sure you are using a local server.";
    }
}

function update() {
    const start = document.getElementById('start-date').value;
    const end = document.getElementById('end-date').value;
    
    // Find index ranges
    const startIndex = globalData.dates.findIndex(d => d >= start);
    const endIndex = globalData.dates.findLastIndex(d => d <= end);
    
    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
        console.warn("Invalid date range");
        return;
    }

    const slicedDates = globalData.dates.slice(startIndex, endIndex + 1);
    const years = (new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24 * 365.25);
    
    const plotDataArr = [];
    const metricsArr = [];

    const colors = ['#ff9900', '#00ffcc', '#dc3912', '#3366cc', '#ff00ff', '#109618', '#00bfff', '#990099', '#f2f2f2', '#888'];
    let colorIdx = 0;

    for (const [name, returns] of Object.entries(globalData.variants)) {
        const slice = returns.slice(startIndex, endIndex + 1);
        
        // Calculate Cumulative
        let cum = 1.0;
        const cumSeries = [1.0];
        let maxVal = 1.0;
        let maxDD = 0.0;
        let sumReturn = 0;
        
        for (let i = 0; i < slice.length; i++) {
            cum *= (1 + slice[i]);
            cumSeries.push(cum);
            if (cum > maxVal) maxVal = cum;
            const dd = (cum - maxVal) / maxVal;
            if (dd < maxDD) maxDD = dd;
            sumReturn += slice[i];
        }

        const finalVal = cum;
        const cagr = Math.pow(Math.max(1e-8, finalVal), 1/years) - 1;
        const avgAnnRet = (sumReturn / slice.length) * 252;
        
        // Volatility
        const mean = sumReturn / slice.length;
        const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (slice.length - 1);
        const vol = Math.sqrt(variance) * Math.sqrt(252);
        
        const sharpe = (vol > 0.001) ? (cagr - 0.02) / vol : 0;

        metricsArr.push({
            "Strategy": name,
            "Total %": finalVal - 1,
            "CAGR": cagr,
            "Avg Ann Ret": avgAnnRet,
            "Max DD": maxDD,
            "Sharpe": sharpe,
            "Ann. Vol": vol
        });

        const color = colors[colorIdx % colors.length];
        const width = (name.includes('Ratchet') || name.includes('Standard')) ? 3 : 1.5;
        
        // Linear Trace
        plotDataArr.push({
            x: slicedDates,
            y: cumSeries.map(v => v - 1),
            name: name,
            type: 'scatter',
            mode: 'lines',
            line: {color: color, width: width},
            xaxis: 'x',
            yaxis: 'y1'
        });
        
        // Log Trace
        plotDataArr.push({
            x: slicedDates,
            y: cumSeries.map(v => Math.max(1e-6, v)),
            name: name,
            type: 'scatter',
            mode: 'lines',
            line: {color: color, width: width},
            xaxis: 'x',
            yaxis: 'y2',
            showlegend: false
        });

        colorIdx++;
    }

    renderTable(metricsArr);
    renderCharts(plotDataArr);
}

function renderTable(metrics) {
    const tbody = document.getElementById('metrics-body');
    tbody.innerHTML = '';
    
    // Default sort by CAGR descending
    metrics.sort((a, b) => b.CAGR - a.CAGR);

    metrics.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:bold">${m.Strategy}</td>
            <td style="color:${m["Total %"] >= 0 ? '#00ffcc' : '#ff4444'}">${(m["Total %"] * 100).toFixed(1)}%</td>
            <td>${(m.CAGR * 100).toFixed(1)}%</td>
            <td>${(m.AvgAnnRet * 100).toFixed(1)}%</td>
            <td style="color:#ff4444">${(m["Max DD"] * 100).toFixed(1)}%</td>
            <td>${m.Sharpe.toFixed(2)}</td>
            <td>${(m["Ann. Vol"] * 100).toFixed(1)}%</td>
        `;
        // Handle the fix for AvgAnnRet key naming inconsistency if needed
        tr.cells[3].innerText = (m["Avg Ann Ret"] * 100).toFixed(1) + "%";
        tbody.appendChild(tr);
    });
}

function renderCharts(traces) {
    const layout = {
        template: 'plotly_dark',
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        margin: {l: 50, r: 50, t: 30, b: 50},
        hovermode: 'x unified',
        xaxis: { anchor: 'y2', showticklabels: true },
        yaxis1: { 
            domain: [0.45, 1], 
            title: 'Cumulative Return (%)', 
            tickformat: '.0%',
            gridcolor: '#2c313c'
        },
        yaxis2: { 
            domain: [0, 0.38], 
            type: 'log', 
            title: 'Growth (Log Scale)',
            gridcolor: '#2c313c'
        },
        legend: { orientation: 'h', y: 1.1, x: 0 }
    };

    Plotly.newPlot('chart-container', traces, layout, {responsive: true});
}

init();
