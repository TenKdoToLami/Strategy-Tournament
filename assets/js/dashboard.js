/**
 * Strategy Tournament — Quant Console Engine
 * Professional multi-tab dashboard with interactive simulations.
 */

'use strict';

/**
 * ── Financial Calculations ──────────────────────────────────────────
 * Core math for advanced risk analytics.
 */
function getMean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function getStdDev(arr) {
    const mean = getMean(arr);
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
}
function getCovariance(arr1, arr2) {
    const m1 = getMean(arr1);
    const m2 = getMean(arr2);
    let cov = 0;
    for (let i = 0; i < arr1.length; i++) {
        cov += (arr1[i] - m1) * (arr2[i] - m2);
    }
    return cov / arr1.length;
}

function calculateAdvancedRiskRatios(pReturns, bReturns, rfReturns) {
    // Annualization factor (daily to yearly)
    const annualFactor = 252;
    const annSqrt = Math.sqrt(annualFactor);

    // 1. Beta
    const varB = Math.pow(getStdDev(bReturns), 2);
    const beta = varB === 0 ? 1 : getCovariance(pReturns, bReturns) / varB;

    // 2. Sharpe Ratio
    const pExcess = pReturns.map((r, i) => r - rfReturns[i]);
    const pMeanExcess = getMean(pExcess);
    const pStdExcess = getStdDev(pExcess);
    const sharpe = pStdExcess === 0 ? 0 : (pMeanExcess / pStdExcess) * annSqrt;

    // 3. Sortino Ratio
    const negatives = pExcess.filter(r => r < 0);
    const downsideDev = negatives.length === 0 ? 1e-6 : Math.sqrt(negatives.reduce((a, b) => a + Math.pow(b, 2), 0) / pExcess.length);
    const sortino = (pMeanExcess / downsideDev) * annSqrt;

    // 4. Jensen's Alpha (Annualized)
    const annRetP = Math.pow(pReturns.reduce((a, b) => a * (1 + b), 1), annualFactor / pReturns.length) - 1;
    const annRetB = Math.pow(bReturns.reduce((a, b) => a * (1 + b), 1), annualFactor / bReturns.length) - 1;
    const annRf = Math.pow(rfReturns.reduce((a, b) => a * (1 + b), 1), annualFactor / rfReturns.length) - 1;
    const alpha = annRetP - (annRf + beta * (annRetB - annRf));

    // 5. Omega Ratio (0 Threshold)
    const posSum = pReturns.reduce((a, b) => a + (b > 0 ? b : 0), 0);
    const negSum = Math.abs(pReturns.reduce((a, b) => a + (b < 0 ? b : 0), 0));
    const omega = negSum === 0 ? 10 : posSum / negSum;

    // 6. Treynor Ratio
    const treynor = (beta === 0) ? 0 : (annRetP - annRf) / beta;

    // 7. Information Ratio
    const activeReturns = pReturns.map((r, i) => r - bReturns[i]);
    const trackError = getStdDev(activeReturns) * annSqrt;
    const infoRatio = trackError === 0 ? 0 : (annRetP - annRetB) / trackError;

    // 8. Calmar Ratio
    const cum = pReturns.reduce((acc, r) => {
        const last = acc[acc.length - 1];
        acc.push(last * (1 + r));
        return acc;
    }, [1.0]);
    let maxDD = 0;
    let peak = 0;
    cum.forEach(v => {
        if (v > peak) peak = v;
        const dd = (peak - v) / peak;
        if (dd > maxDD) maxDD = dd;
    });
    const cagr = annRetP;
    const calmar = maxDD === 0 ? 10 : cagr / maxDD;

    return { beta, sharpe, sortino, alpha, omega, treynor, infoRatio, calmar };
}

function renderRiskGrid(ratios, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const config = {
        beta: { 
            title: 'Beta', icon: 'fa-chart-line', min: 0, max: 2, val: ratios.beta, 
            label: ratios.beta.toFixed(2), class: 'grad-beta',
            hint: 'Meaning: Sensitivity to market movements. 1.0 = Moves with market. > 1.0 = Aggressive.' 
        },
        sharpe: { 
            title: 'Sharpe', icon: 'fa-bolt', min: -1, max: 3, val: ratios.sharpe, 
            label: ratios.sharpe.toFixed(2), class: 'grad-pos',
            hint: 'Meaning: Reward per unit of total risk. Higher is better.' 
        },
        sortino: { 
            title: 'Sortino', icon: 'fa-shield-halved', min: -1, max: 4, val: ratios.sortino, 
            label: ratios.sortino.toFixed(2), class: 'grad-pos',
            hint: 'Meaning: Reward per unit of DOWNSIDE risk only. Focuses on "bad" volatility.' 
        },
        alpha: { 
            title: 'Alpha', icon: 'fa-gem', min: -0.05, max: 0.15, val: ratios.alpha, 
            label: (ratios.alpha * 100).toFixed(1) + '%', class: 'grad-alpha',
            hint: 'Meaning: Excess return relative to the benchmark after adjusting for Beta.' 
        },
        omega: { 
            title: 'Omega', icon: 'fa-scale-balanced', min: 0.5, max: 2.5, val: ratios.omega, 
            label: ratios.omega.toFixed(2), class: 'grad-neutral',
            hint: 'Meaning: Probability of gains vs losses. 1.0 is neutral. > 1.0 is desirable.' 
        },
        treynor: { 
            title: 'Treynor', icon: 'fa-arrow-up-right-dots', min: -0.1, max: 0.4, val: ratios.treynor, 
            label: (ratios.treynor * 100).toFixed(1) + '%', class: 'grad-neutral',
            hint: 'Meaning: Return per unit of SYSTEMATIC (Market) risk.' 
        },
        infoRatio: { 
            title: 'Information', icon: 'fa-circle-info', min: -1, max: 3, val: ratios.infoRatio, 
            label: ratios.infoRatio.toFixed(2), class: 'grad-neutral',
            hint: 'Meaning: Consistency of active return relative to benchmark. Skill-based.' 
        },
        calmar: { 
            title: 'Calmar', icon: 'fa-mountain', min: -1, max: 5, val: ratios.calmar, 
            label: ratios.calmar.toFixed(2), class: 'grad-pos',
            hint: 'Meaning: Annual return relative to the Maximum Drawdown.' 
        }
    };

    let html = `<div class="risk-metrics-grid">`;
    Object.keys(config).forEach(k => {
        const c = config[k];
        let pct = ((c.val - c.min) / (c.max - c.min)) * 100;
        pct = Math.max(2, Math.min(98, pct));

        html += `
            <div class="risk-gauge-card">
                <div class="risk-gauge-header">
                    <div class="risk-gauge-title">
                        <i class="fas ${c.icon}"></i>
                        <span>${c.title}</span>
                        <i class="fas fa-circle-question info-trigger" data-hint="${c.hint}" data-title="${c.title}" style="cursor:pointer; opacity:0.7"></i>
                    </div>
                </div>
                <div class="risk-gauge-value">${c.label}</div>
                <div class="gauge-container">
                    <div class="gauge-track ${c.class}"></div>
                    <div class="gauge-marker" style="left: ${pct}%"></div>
                </div>
            </div>
        `;
    });
    html += `</div>`;
    container.innerHTML = html;
    container.style.display = 'block';

    // Add event listeners for info icons
    container.querySelectorAll('.info-trigger').forEach(icon => {
        icon.onclick = (e) => {
            const h = e.target.dataset.hint;
            const t = e.target.dataset.title;
            alert(`${t}\n\n${h}`);
        };
    });
}



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
    level: [],
    logic: [],
    mix: [],
    trendType: ['SMA', 'EMA', 'None']
};

let labWeights = [
    { VOO: 100, VOO2: 0, VOO4: 0, DJP: 0, BILL: 0 },
    { VOO: 50, VOO2: 50, VOO4: 0, DJP: 0, BILL: 0 },
    { VOO: 0, VOO2: 100, VOO4: 0, DJP: 0, BILL: 0 },
    { VOO: 0, VOO2: 50, VOO4: 50, DJP: 0, BILL: 0 },
    { VOO: 0, VOO2: 0, VOO4: 100, DJP: 0, BILL: 0 }
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
    'Benchmark VOO (1x)': '#ffd866',
    'Benchmark VOO (2x)': '#ff6b6b',
    'Benchmark VOO (4x)': '#ee3344',
    'Benchmark DJP (1x)': '#4ecdc4',
    'Inflation (CPI)': '#8892b0',
    'Legacy BEAST': '#ff79c6',
    'Special BEAST (v2)': '#bd93f9',
    'Special SCALPEL (v2)': '#8be9fd',
    'Special PREDATOR': '#50fa7b',
    'Special BEAST': '#ff79c6',
    'Special SCALPEL': '#8be9fd',
    'Special SHIELD': '#f1fa8c'
};

// ── State Sync (Deep Linking) ──────────────────────────────────────
function syncStateToUrl(isNewState = true) {
    const params = new URLSearchParams();
    
    // Tab
    params.set('tab', currentTab);
    
    // Dates
    const start = document.getElementById('start-date')?.value;
    const end = document.getElementById('end-date')?.value;
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    
    // Strategy Selections
    const explorerStrat = document.getElementById('explorer-picker')?.value;
    const explorerCompare = document.getElementById('explorer-compare-picker')?.value;
    if (explorerStrat) params.set('strat', explorerStrat);
    if (explorerCompare) params.set('compare', explorerCompare);
    
    const simStrat = document.getElementById('sim-strategy-picker')?.value;
    if (simStrat) params.set('sStrat', simStrat);
    
    const labCompare = document.getElementById('lab-compare-picker')?.value;
    if (labCompare) params.set('lCompare', labCompare);
    
    // Full Lab Config (Only if we have a custom result or are on lab tab)
    if (currentTab === 'lab' || window.customStrategyResult) {
        params.set('lR', document.getElementById('lab-ratchet')?.checked ? '1' : '0');
        params.set('lT', document.getElementById('lab-trend')?.checked ? '1' : '0');
        params.set('lE', document.getElementById('lab-use-ema')?.checked ? '1' : '0');
        params.set('lS', document.getElementById('lab-sma')?.value || '200');
        params.set('lEP', document.getElementById('lab-ema')?.value || '50');
        params.set('lM', document.getElementById('lab-sma-mode')?.value || 'T0');
        
        const b = [
            document.getElementById('lab-b1')?.value || '5',
            document.getElementById('lab-b2')?.value || '10',
            document.getElementById('lab-b3')?.value || '20',
            document.getElementById('lab-b4')?.value || '30'
        ];
        params.set('lB', b.join(','));
        
        const weights = [];
        labWeights.forEach(row => {
            weights.push(row.VOO, row.VOO2, row.VOO4, row.DJP, row.BILL);
        });
        params.set('lW', weights.join(','));
    }
    
    // Filters
    if (activeFilters.level.length > 0) params.set('fLevel', activeFilters.level.join(','));
    if (activeFilters.logic.length > 0) params.set('fLogic', activeFilters.logic.join(','));
    if (activeFilters.mix.length > 0) params.set('fMix', activeFilters.mix.join(','));
    if (activeFilters.trendType.length > 0) params.set('fTrend', activeFilters.trendType.join(','));
    
    const newHash = '#' + params.toString();
    if (location.hash !== newHash) {
        if (isNewState) {
            history.pushState(null, '', newHash);
        } else {
            history.replaceState(null, '', newHash);
        }
    }
}

function syncStateFromUrl() {
    const hash = location.hash.replace('#', '');
    if (!hash) return;
    
    const params = new URLSearchParams(hash);
    
    // Dates
    const start = params.get('start');
    const end = params.get('end');
    if (start) document.getElementById('start-date').value = start;
    if (end) document.getElementById('end-date').value = end;
    
    // Strategy Selections
    const strat = params.get('strat');
    const compare = params.get('compare');
    if (strat) document.getElementById('explorer-picker').value = strat;
    if (compare) document.getElementById('explorer-compare-picker').value = compare;
    
    const sStrat = params.get('sStrat');
    if (sStrat && document.getElementById('sim-strategy-picker')) {
        document.getElementById('sim-strategy-picker').value = sStrat;
    }
    
    const lCompare = params.get('lCompare');
    if (lCompare && document.getElementById('lab-compare-picker')) {
        document.getElementById('lab-compare-picker').value = lCompare;
    }
    
    // Lab Config
    let shouldRunLab = false;
    if (params.has('lW')) {
        shouldRunLab = true;
        const w = params.get('lW').split(',').map(v => parseFloat(v) || 0);
        if (w.length === 25) {
            for (let i = 0; i < 5; i++) {
                labWeights[i] = {
                    VOO: w[i*5], VOO2: w[i*5+1], VOO4: w[i*5+2], DJP: w[i*5+3], BILL: w[i*5+4]
                };
            }
            renderWeightTable();
        }
        
        const b = params.get('lB')?.split(',') || [];
        if (b.length === 4) {
            document.getElementById('lab-b1').value = b[0];
            document.getElementById('lab-b2').value = b[1];
            document.getElementById('lab-b3').value = b[2];
            document.getElementById('lab-b4').value = b[3];
        }
        
        if (params.has('lR')) document.getElementById('lab-ratchet').checked = params.get('lR') === '1';
        if (params.has('lT')) document.getElementById('lab-trend').checked = params.get('lT') === '1';
        if (params.has('lE')) document.getElementById('lab-use-ema').checked = params.get('lE') === '1';
        if (params.has('lS')) document.getElementById('lab-sma').value = params.get('lS');
        if (params.has('lEP')) document.getElementById('lab-ema').value = params.get('lEP');
        if (params.has('lM')) document.getElementById('lab-sma-mode').value = params.get('lM');
    }
    
    // Filters
    const parseFilter = (key, filterKey) => {
        const val = params.get(key);
        if (val !== null) {
            activeFilters[filterKey] = val ? val.split(',') : [];
            // Update UI pills
            document.querySelectorAll(`#filter-${filterKey} .pill`).forEach(p => {
                p.classList.toggle('active', activeFilters[filterKey].includes(p.dataset.value));
            });
        }
    };
    parseFilter('fLevel', 'level');
    parseFilter('fLogic', 'logic');
    parseFilter('fMix', 'mix');
    parseFilter('fTrend', 'trendType');
    
    // Tab (Switching tab should be last as it calls update())
    const tab = params.get('tab');
    if (tab && tab !== currentTab) {
        switchTab(tab, false); // Pass false to prevent re-pushing state
    } else {
        update(); // If tab didn't change, we still need to update charts for dates/filters
        if (currentTab === 'explorer') updateExplorer();
        if (currentTab === 'simulator') updateSimulator();
        if (currentTab === 'lab' || shouldRunLab) {
            if (shouldRunLab) runLabSimulation(false); // don't push state again
            else if (window.customStrategyResult) updateLabResults();
        }
    }
}

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
        const p = entry.params || {};
        const smaPeriod = p.sma || 0;
        const isTrend = smaPeriod > 0;
        const logic = p.logic || 'Daily';
        const smaMode = p.smaMode || (isTrend ? 'T0' : 'None');

        // Deduce Mix: If any tier has DJP (idx 3) or BILL (idx 4) > 0, it's 'Safeties'
        let mix = 'Pure';
        if (entry.weights && entry.weights.some(w => w[3] > 0 || w[4] > 0)) {
            mix = 'Safeties';
        }

        return { name, logic, mix, isTrend, smaPeriod, smaMode, level: entry.group, text: entry.text, params: p };
    }
    // Fallback for custom or legacy
    if (name === '🧪 USER CUSTOM LAB') {
        const entry = { weights: labWeights };
        let mix = 'Pure';
        if (labWeights.some(w => w.DJP > 0 || w.BILL > 0)) mix = 'Safeties';
        
        // Pull active lab params for signals/mechanisms
        const smaPeriod = document.getElementById('lab-trend')?.checked ? (parseInt(document.getElementById('lab-sma')?.value) || 0) : 0;
        const emaPeriod = document.getElementById('lab-use-ema')?.checked ? (parseInt(document.getElementById('lab-ema')?.value) || 0) : 0;
        const smaMode = document.getElementById('lab-sma-mode')?.value || 'T0';

        return { 
            name, level: 'Custom', logic: 'Linear', mix, 
            text: 'Custom Lab strategy based on user-defined bounds and leverage weights.',
            params: { sma: smaPeriod, ema: emaPeriod, smaMode: smaMode },
            isTrend: smaPeriod > 0 || emaPeriod > 0,
            smaPeriod,
            smaMode
        };
    }

    if (name.startsWith('Benchmark')) return { name, level: 'Benchmark', logic: 'Daily', mix: 'Pure' };
    if (name.startsWith('Special')) return { name, level: 'Special', logic: 'Daily', mix: 'Pure' };
    const parts = name.split(' ');
    return { name, level: parts[0] || 'Standard', logic: parts[1] || 'Daily', mix: parts[2] || 'Pure' };
}

// ── Lab Simulation Engine ──────────────────────────────────────────
function calculateSMAVector(prices, period) {
    const n = prices.length;
    const sma = new Float32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
        sum += prices[i];
        if (i >= period) sum -= prices[i - period];
        if (i >= period - 1) sma[i] = sum / period;
        else sma[i] = prices[i]; // Fallback for warmup
    }
    return sma;
}

function calculateEMAVector(prices, period) {
    const n = prices.length;
    const ema = new Float32Array(n);
    const k = 2 / (period + 1);
    ema[0] = prices[0];
    for (let i = 1; i < n; i++) {
        ema[i] = (prices[i] - ema[i - 1]) * k + ema[i - 1];
    }
    return ema;
}

function getVooPrices() {
    if (window._vooPrices) return window._vooPrices;
    const raw = globalData.raw_returns.VOO;
    const n = raw.length;
    const prices = new Float32Array(n);
    let vooPrice = 1.0;
    for (let i = 0; i < n; i++) {
        vooPrice *= (1 + raw[i]);
        prices[i] = vooPrice;
    }
    window._vooPrices = prices;
    return prices;
}

function simulateCustomStrategy(bounds, useRatchet, useSMA, smaPeriod = 200, useEMA = false, emaPeriod = 50, smaMode = 'T0') {
    const raw = globalData.raw_returns;
    const n = raw.VOO.length;
    const prices = getVooPrices();
    
    // Calculate SMA signal
    let smaSignal;
    if (useSMA && smaPeriod > 0) {
        const smaValues = calculateSMAVector(prices, smaPeriod);
        smaSignal = new Int8Array(n);
        for (let i = 0; i < n; i++) smaSignal[i] = prices[i] >= smaValues[i] ? 1 : 0;
    }

    // Calculate EMA signal
    let emaSignal;
    if (useEMA && emaPeriod > 0) {
        const emaValues = calculateEMAVector(prices, emaPeriod);
        emaSignal = new Int8Array(n);
        for (let i = 0; i < n; i++) emaSignal[i] = prices[i] >= emaValues[i] ? 1 : 0;
    }

    let vooCum = 1.0, vooAth = 1.0;
    const dds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        vooCum *= (1 + raw.VOO[i]);
        if (vooCum > vooAth) vooAth = vooCum;
        dds[i] = (vooCum - vooAth) / vooAth;
    }

    const tiers = new Int8Array(n);
    let currentMaxTier = 0;
    for (let i = 1; i < n; i++) {
        const yDD = dds[i - 1];
        
        // Logical OR: Panic if SMA is bear OR EMA is bear
        const smaBear = useSMA && smaSignal && (smaSignal[i - 1] === 0);
        const emaBear = useEMA && emaSignal && (emaSignal[i - 1] === 0);
        const isPanic = smaBear || emaBear;

        let tier = 0;
        if (yDD <= -bounds[3] / 100) tier = 4;
        else if (yDD <= -bounds[2] / 100) tier = 3;
        else if (yDD <= -bounds[1] / 100) tier = 2;
        else if (yDD <= -bounds[0] / 100) tier = 1;

        if (isPanic) {
            // Apply flexible SMA/EMA target
            if (smaMode.startsWith('T')) {
                tier = parseInt(smaMode[1]) || 0;
            } else if (smaMode === 'Cash') {
                tier = -1; // Sentinel for Cash/BILL
            } else {
                tier = 0;
            }
        }

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
        const sum = (row.VOO + row.VOO2 + row.VOO4 + row.DJP + row.BILL) || 100;
        return { VOO: row.VOO / sum, VOO2: row.VOO2 / sum, VOO4: row.VOO4 / sum, DJP: row.DJP / sum, BILL: row.BILL / sum };
    });

    for (let i = 0; i < n; i++) {
        const t = tiers[i];
        let w;
        
        if (t === -1) {
            w = { VOO: 0, VOO2: 0, VOO4: 0, DJP: 0, BILL: 1.0 };
        } else {
            w = normWeights[t] || normWeights[0];
        }

        results[i] = raw.VOO[i] * w.VOO + raw.VOO2[i] * w.VOO2 + raw.VOO4[i] * w.VOO4 + raw.DJP[i] * w.DJP + raw.BILL[i] * w.BILL;
        leverage[i] = w.VOO + w.VOO2 * 2 + w.VOO4 * 4 + w.DJP;
    }
    return { returns: results, leverage };
}

// ── Mechanism Visualization Logic ──────────────────────────────────
function getStrategySignals(name, startIndex, endIndex) {
    const prices = getVooPrices();
    const meta = parseStrategy(name);
    const p = meta.params || {};
    
    let res = { prices: prices.slice(startIndex, endIndex + 1), sma: null, ema: null, panic: [] };
    
    if (p.sma > 0) {
        const smaFull = calculateSMAVector(prices, p.sma);
        res.sma = smaFull.slice(startIndex, endIndex + 1);
    }
    if (p.ema > 0) {
        const emaFull = calculateEMAVector(prices, p.ema);
        res.ema = emaFull.slice(startIndex, endIndex + 1);
    }

    // Determine Panic State (Below trend)
    const n = res.prices.length;
    res.panicState = [];
    for (let i = 0; i < n; i++) {
        const smaBear = res.sma && (res.prices[i] < res.sma[i]);
        const emaBear = res.ema && (res.prices[i] < res.ema[i]);
        
        if (smaBear && emaBear) res.panicState.push('both');
        else if (smaBear) res.panicState.push('sma');
        else if (emaBear) res.panicState.push('ema');
        else res.panicState.push(null);
    }
    
    return res;
}

function renderMechanismChart(prefix, name, startIndex, endIndex) {
    const chartId = `chart-${prefix}-mechanism`;
    const container = document.getElementById(chartId);
    if (!container) return;

    const data = getStrategySignals(name, startIndex, endIndex);
    const dates = globalData.dates.slice(startIndex, endIndex + 1);
    
    const traces = [
        {
            x: dates, y: data.prices, name: 'VOO Price',
            line: { color: '#ffffff', width: 2 }, type: 'scatter', mode: 'lines',
            hoverinfo: 'none'
        }
    ];

    if (data.sma) {
        traces.push({
            x: dates, y: data.sma, name: 'SMA Trend',
            line: { color: '#ffd866', width: 1.5, dash: 'dot' }, type: 'scatter', mode: 'lines',
            hoverinfo: 'none'
        });
    }
    if (data.ema) {
        traces.push({
            x: dates, y: data.ema, name: 'EMA Trend',
            line: { color: '#bd93f9', width: 1.5, dash: 'dot' }, type: 'scatter', mode: 'lines',
            hoverinfo: 'none'
        });
    }

    // Generate Panic Shapes
    const shapes = [];
    let start = null;
    let currentState = null;

    const STATE_COLORS = {
        'sma': 'rgba(255, 216, 102, 0.12)', // Gold
        'ema': 'rgba(189, 147, 249, 0.12)', // Purple
        'both': 'rgba(255, 83, 112, 0.15)'   // Red
    };

    for (let i = 0; i < data.panicState.length; i++) {
        const state = data.panicState[i];
        
        if (state !== currentState) {
            // Close previous shape if any
            if (currentState !== null && start !== null) {
                shapes.push({
                    type: 'rect', xref: 'x', yref: 'paper',
                    x0: start, x1: dates[i - 1], y0: 0, y1: 1,
                    fillcolor: STATE_COLORS[currentState],
                    line: { width: 0 }, layer: 'below'
                });
            }
            // Start new shape
            start = state !== null ? dates[i] : null;
            currentState = state;
        }
    }
    // Handle final open shape
    if (currentState !== null && start !== null) {
        shapes.push({
            type: 'rect', xref: 'x', yref: 'paper',
            x0: start, x1: dates[dates.length - 1], y0: 0, y1: 1,
            fillcolor: STATE_COLORS[currentState],
            line: { width: 0 }, layer: 'below'
        });
    }

    const layout = {
        ...cloneLayout(),
        yaxis: { ...PLOTLY_LAYOUT.yaxis, type: 'log', title: 'Price (Log)' },
        shapes: shapes,
        height: 400
    };

    Plotly.react(chartId, traces, layout, PLOTLY_CONFIG);
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

    const traces = { linear: [], log: [], drawdown: [], vol: [], yearly: [], leverage: [], real: [] };
    const metricsArr = [];

    const allVariants = { ...globalData.variants };
    if (window.customStrategyResult) allVariants['🧪 USER CUSTOM LAB'] = window.customStrategyResult.returns;

    for (const [name, returns] of Object.entries(allVariants)) {
        const meta = parseStrategy(name);
        const isCustom = name === '🧪 USER CUSTOM LAB';

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
        
        const rfSlice = globalData.raw_returns['BILL'].slice(startIndex, endIndex + 1);
        const pExcess = slice.map((r, i) => r - rfSlice[i]);
        const pMeanExcess = getMean(pExcess);
        const pStdExcess = getStdDev(pExcess);
        const sharpe = pStdExcess === 0 ? 0 : (pMeanExcess / pStdExcess) * Math.sqrt(252);


        const yearlyMap = {};
        for (let i = 0; i < slice.length; i++) {
            const date = slicedDates[i];
            const year = date.substring(0, 4);
            if (!yearlyMap[year]) yearlyMap[year] = 1.0;
            yearlyMap[year] *= (1 + slice[i]);
        }

        metricsArr.push({
            Strategy: name, 'Total %': cum - 1, CAGR: cagr, 'Avg Ann Ret': (sumReturn / slice.length) * 252,
            'Max DD': maxDD, Sharpe: sharpe, 'Ann. Vol': vol, cumSeries, ddSeries
        });
    }

    const filteredMetrics = metricsArr.filter(m => {
        const info = parseStrategy(m.Strategy);
        const hasSMA = info.smaPeriod > 0;
        const hasEMA = info.params && info.params.ema > 0;
        const isNone = !hasSMA && !hasEMA;

        const trendMatch = (hasSMA && activeFilters.trendType.includes('SMA')) ||
                           (hasEMA && activeFilters.trendType.includes('EMA')) ||
                           (isNone && activeFilters.trendType.includes('None'));

        return activeFilters.level.includes(info.level || 'Special') &&
               activeFilters.logic.includes(info.logic) &&
               activeFilters.mix.includes(info.mix) &&
               trendMatch;
    });

    filteredMetrics.forEach(m => {
        // Final NaN safety check
        m.cumSeries = m.cumSeries.map(v => (v === null || isNaN(v)) ? 1.0 : v);
        m.ddSeries = m.ddSeries.map(v => (v === null || isNaN(v)) ? 0.0 : v);

        const name = m.Strategy;
        const isCustom = name === '🧪 USER CUSTOM LAB';
        const meta = parseStrategy(name);
        let color;
        if (isCustom) color = '#39ff14';
        else if ((meta.level === 'Benchmark' || meta.level === 'Special') && BENCHMARK_COLORS[name]) color = BENCHMARK_COLORS[name];
        else color = getAdaptiveColor(filteredMetrics.indexOf(m), filteredMetrics.length);
        m.color = color;

        if (currentTab === 'dashboard' && !window.hiddenStrategies.has(name)) {
            const width = (isCustom || name.includes('Ratchet') || name.includes('Standard')) ? 2 : 1;
            const chartReturns = m.cumSeries.slice(1);
            const chartDD = m.ddSeries.slice(1);

            traces.linear.push({ x: slicedDates, y: chartReturns.map(v => v - 1), name, line: { color, width }, type: 'scatter', mode: 'lines', legendgroup: name, hoverinfo: 'none' });
            traces.log.push({ x: slicedDates, y: chartReturns.map(v => Math.max(1e-6, v)), name, line: { color, width }, type: 'scatter', mode: 'lines', legendgroup: name, hoverinfo: 'none' });
            traces.drawdown.push({ x: slicedDates, y: chartDD, name, line: { color, width: 1.5 }, fill: 'tozeroy', type: 'scatter', mode: 'lines', legendgroup: name, hoverinfo: 'none' });

            const rollVol = [];
            const slice = isCustom ? window.customStrategyResult.returns.slice(startIndex, endIndex + 1) : globalData.variants[name].slice(startIndex, endIndex + 1);
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

            const yearlyMap = {};
            for (let i = 0; i < slice.length; i++) {
                const date = slicedDates[i];
                const year = date.substring(0, 4);
                if (!yearlyMap[year]) yearlyMap[year] = 1.0;
                yearlyMap[year] *= (1 + slice[i]);
            }
            const yearLabels = Object.keys(yearlyMap).sort();
            traces.yearly.push({ x: yearLabels, y: yearLabels.map(y => yearlyMap[y] - 1), name, type: 'bar', marker: { color }, legendgroup: name, hoverinfo: 'none' });
        }
    });

    renderTable(filteredMetrics);
    

    if (currentTab === 'dashboard') {
        const baseLayout = {
            ...cloneLayout(),
            hovermode: 'x',
            xaxis: { showspikes: true, spikemode: 'across', spikecolor: '#fff', spikethickness: 1 }
        };

        const linLay = { ...baseLayout, yaxis: { ...baseLayout.yaxis, title: 'Return (%)', tickformat: '.0%' } };
        Plotly.react('chart-linear', traces.linear, linLay, PLOTLY_CONFIG);

        const logLay = { ...baseLayout, yaxis: { ...baseLayout.yaxis, type: 'log', title: 'Index (Log Scale)' } };
        Plotly.react('chart-log', traces.log, logLay, PLOTLY_CONFIG);

        const ddLay = { ...baseLayout, yaxis: { ...baseLayout.yaxis, title: 'Drawdown (%)', tickformat: '.1%', range: [null, 0] } };
        Plotly.react('chart-drawdown', traces.drawdown, ddLay, PLOTLY_CONFIG);

        const volLay = { ...baseLayout, yaxis: { ...baseLayout.yaxis, title: '1-Year Vol (%)' } };
        Plotly.react('chart-volatility', traces.vol, volLay, PLOTLY_CONFIG);

        const levLay = { ...baseLayout, yaxis: { ...baseLayout.yaxis, title: 'Leverage', range: [0, 4.5], tickformat: '.1f' } };
        Plotly.react('chart-leverage', traces.leverage, levLay, PLOTLY_CONFIG);

        const realLay = { ...baseLayout, yaxis: { ...baseLayout.yaxis, title: 'Real Growth (Inflation Adj)', type: 'log' } };
        Plotly.react('chart-real', traces.real, realLay, PLOTLY_CONFIG);

        const yearLay = { ...cloneLayout(), yaxis: { ...PLOTLY_LAYOUT.yaxis, title: 'Yearly Return (%)', tickformat: '.0%' }, barmode: 'group' };
        Plotly.react('chart-yearly', traces.yearly, yearLay, PLOTLY_CONFIG);

        initTooltipEngine(['chart-linear', 'chart-log', 'chart-drawdown', 'chart-volatility', 'chart-leverage', 'chart-real', 'chart-yearly']);
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
function renderUnifiedAnalyticsStrip(containerId, mPrimary, ratiosPrimary, mCompare, ratiosCompare) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const generateRowHtml = (m, ratios, label) => {
        if (!m || !ratios) return '';

        const perfConfig = [
            { title: 'Total Return', value: (m['Total %'] + 1).toFixed(1) + 'x', class: m['Total %'] >= 0 ? 'pos' : 'neg', 
              calc: 'Cumulative growth of capital: (Ending Value / Starting Value).',
              meaning: 'Total absolute multiplier of the original investment over the period.' },
            { title: 'Annual CAGR', value: (m.CAGR * 100).toFixed(1) + '%', class: m.CAGR >= 0 ? 'pos' : 'neg', 
              calc: 'CAGR = ((End Value / Start Value)^(1/Years)) - 1.',
              meaning: 'The geometric mean return that provides a steady rate of return over the period.' },
            { title: 'Max Drawdown', value: (m['Max DD'] * 100).toFixed(1) + '%', class: 'neg', 
              calc: 'Max DD = (Peak - Trough) / Peak.',
              meaning: 'The largest peak-to-trough decline observed, indicating structural risk.' },
            { title: 'Ann. Volatility', value: (m['Ann. Vol'] * 100).toFixed(1) + '%', class: '', 
              calc: 'Standard deviation of daily returns * sqrt(252).',
              meaning: 'A measure of price fluctuations. Higher volatility means greater price swings.' }
        ];

        const riskConfig = {
            sharpe: { 
                title: 'Sharpe', icon: 'fa-bolt', min: -1, max: 3, val: ratios.sharpe, 
                label: ratios.sharpe.toFixed(2), class: 'grad-pos',
                calc: '(Mean Excess Return / StdDev of Excess Return) * sqrt(252).',
                meaning: 'Risk-adjusted return. Measures reward per unit of total risk.' 
            },
            beta: { 
                title: 'Beta', icon: 'fa-chart-line', min: 0, max: 2, val: ratios.beta, 
                label: ratios.beta.toFixed(2), class: 'grad-beta',
                calc: 'Covariance(Portfolio, Market) / Variance(Market).',
                meaning: 'Sensitivity to market movements. 1.0 = Moves with market. > 1.0 = Aggressive.' 
            },
            sortino: { 
                title: 'Sortino', icon: 'fa-shield-halved', min: -1, max: 4, val: ratios.sortino, 
                label: ratios.sortino.toFixed(2), class: 'grad-pos',
                calc: '(Mean Excess Return / Downside StdDev) * sqrt(252).',
                meaning: 'Risk-adjusted return focusing only on negative (bad) volatility.' 
            },
            alpha: { 
                title: 'Alpha', icon: 'fa-gem', min: -0.05, max: 0.15, val: ratios.alpha, 
                label: (ratios.alpha * 100).toFixed(1) + '%', class: 'grad-alpha',
                calc: 'Portfolio Return - [RiskFree + Beta * (Market - RiskFree)]',
                meaning: 'Value added by the strategy relative to its benchmark exposure.' 
            },
            omega: { 
                title: 'Omega', icon: 'fa-scale-balanced', min: 0.5, max: 2.5, val: ratios.omega, 
                label: ratios.omega.toFixed(2), class: 'grad-neutral',
                calc: 'Sum(Gains) / |Sum(Losses)| above a threshold (0%).',
                meaning: 'Probability-weighted ratio of gains versus losses.' 
            },
            treynor: { 
                title: 'Treynor', icon: 'fa-arrow-up-right-dots', min: -0.1, max: 0.4, val: ratios.treynor, 
                label: (ratios.treynor * 100).toFixed(1) + '%', class: 'grad-neutral',
                calc: '(Portfolio Return - RiskFree Rate) / Beta.',
                meaning: 'Risk-adjusted return based on systematic risk (market exposure).' 
            },
            infoRatio: { 
                title: 'Information', icon: 'fa-circle-info', min: -1, max: 3, val: ratios.infoRatio, 
                label: ratios.infoRatio.toFixed(2), class: 'grad-neutral',
                calc: '(Strategy Return - Benchmark Return) / Tracking Error.',
                meaning: 'Measures consistency of excess returns relative to a benchmark.' 
            },
            calmar: { 
                title: 'Calmar', icon: 'fa-mountain', min: -1, max: 5, val: ratios.calmar, 
                label: ratios.calmar.toFixed(2), class: 'grad-pos',
                calc: 'Annualized Return / Maximum Drawdown.',
                meaning: 'Efficiency ratio comparing return potential to drawdown risk.' 
            }
        };

        const tradeConfig = [
            { title: 'Total Pivots', value: ratios.totalPivots.toLocaleString(), 
              calc: 'Count of days where the strategy changed its allocation or leverage.',
              meaning: 'Indicates the churn rate. More pivots mean more potential slippage/commission costs.' },
            { title: 'Trades / Mo', value: ratios.tradesPerMonth.toFixed(1), 
              calc: 'Total Pivots / Total Months in period.',
              meaning: 'Average monthly rebalancing frequency.' },
            { title: 'Avg Leverage', value: ratios.avgLeverage.toFixed(2) + 'x', 
              calc: 'Average daily leverage factor over the period.',
              meaning: 'The real-world "heaviness" of the portfolio.' }
        ];

        const edgeConfig = [
            { title: 'Expectancy', value: (ratios.expectancy * 100).toFixed(2) + '%', 
              calc: 'The average expected return per trading day.',
              meaning: 'Mathematical "Edge" per day of market exposure.' }
        ];

        let rowHtml = `
            <div class="risk-row-group">
                <div class="risk-row-label">${label}</div>
                <div class="risk-row-data text-row">
        `;

        [...perfConfig, ...tradeConfig, ...edgeConfig].forEach(c => {
            rowHtml += `
                <div class="risk-gauge-card">
                    <div class="risk-gauge-header">
                        <div class="risk-gauge-title">
                            <span>${c.title}</span>
                            <i class="fas fa-circle-question info-trigger" 
                               data-calc="${c.calc}" 
                               data-meaning="${c.meaning}" 
                               data-title="${c.title}"></i>
                        </div>
                    </div>
                    <div class="risk-gauge-value ${c.class || ''}" ${c.title === 'Avg Leverage' ? 'style="color:var(--blue)"' : ''}>${c.value}</div>
                </div>
            `;
        });

        rowHtml += `</div><div class="risk-row-data gauge-row">`;

        Object.keys(riskConfig).forEach(k => {
            const c = riskConfig[k];
            let pct = ((c.val - c.min) / (c.max - c.min)) * 100;
            pct = Math.max(2, Math.min(98, pct));
            rowHtml += `
                <div class="risk-gauge-card">
                    <div class="risk-gauge-header">
                        <div class="risk-gauge-title">
                            <i class="fas ${c.icon}"></i>
                            <span>${c.title}</span>
                            <i class="fas fa-circle-question info-trigger" 
                               data-calc="${c.calc}" 
                               data-meaning="${c.meaning}" 
                               data-title="${c.title}"></i>
                        </div>
                    </div>
                    <div class="risk-gauge-value">${c.label}</div>
                    <div class="gauge-container">
                        <div class="gauge-track ${c.class}"></div>
                        <div class="gauge-marker" style="left: ${pct}%"></div>
                    </div>
                </div>
            `;
        });

        rowHtml += `</div></div>`;
        return rowHtml;
    };

    let fullHtml = generateRowHtml(mPrimary, ratiosPrimary, mPrimary.Strategy);
    if (mCompare && ratiosCompare) {
        fullHtml += generateRowHtml(mCompare, ratiosCompare, mCompare.Strategy);
    }

    container.innerHTML = fullHtml;
    container.style.display = 'block';

    // Re-bind hover events for info-trigger
    container.querySelectorAll('.info-trigger').forEach(target => {
        target.addEventListener('mouseenter', showAnalyticsTooltip);
        target.addEventListener('mouseleave', hideAnalyticsTooltip);
    });
}

function selectStrategyForExplorer(name) {
    document.getElementById('explorer-picker').value = name;
    updateExplorer();
    syncStateToUrl(true);
}


function renderAnalysisSuite(prefix, name, compareName) {
    if (!name || !window.allMetrics) return;
    const m = window.allMetrics.find(x => x.Strategy === name);
    if (!m) return;

    const mCompare = compareName ? window.allMetrics.find(x => x.Strategy === compareName) : null;
    
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
        const useSMA = meta.isTrend || (prefix === 'lab' && document.getElementById('lab-trend').checked);
        const useEMA = (meta.params?.ema > 0) || (prefix === 'lab' && document.getElementById('lab-use-ema').checked);

        if (metaContainer) {
            metaContainer.innerHTML = `<span class="pill-badge group-badge">${meta.level}</span>`;
            metaContainer.innerHTML += `<span class="pill-badge ${isRatchet ? 'active' : ''}">${isRatchet ? 'Ratchet Logic' : 'Daily Reset'}</span>`;
            if (meta.mix === 'Pure') metaContainer.innerHTML += '<span class="pill-badge">Pure Equity</span>';
            else metaContainer.innerHTML += '<span class="pill-badge active" style="border-color:var(--accent); color:var(--accent)">Safeties Active</span>';
            
            const prices = getVooPrices();
            const startVal = document.getElementById('start-date').value;
            const endVal = document.getElementById('end-date').value;
            const startIdx = globalData.dates.findIndex(d => d >= startVal);
            const endIdx = globalData.dates.findLastIndex(d => d <= endVal);
            
            if (startIdx !== -1 && endIdx !== -1) {
                const totalDays = endIdx - startIdx + 1;
                const modeStr = meta.smaMode || (prefix === 'lab' ? document.getElementById('lab-sma-mode').value : 'T0');

                if (useSMA) {
                    const smaPeriod = meta.smaPeriod || (prefix === 'lab' ? parseInt(document.getElementById('lab-sma').value) : 200);
                    const smaValues = calculateSMAVector(prices, smaPeriod);
                    let bearDays = 0;
                    for(let i = startIdx; i <= endIdx; i++) if (prices[i] < smaValues[i]) bearDays++;
                    const pct = ((bearDays / totalDays) * 100).toFixed(1);
                    metaContainer.innerHTML += `<span class="pill-badge active" style="background:rgba(255,82,82,0.1); border-color:var(--red); color:#ff5252">SMA ${smaPeriod} (Target: ${modeStr}): ${bearDays.toLocaleString()} Days Protected (${pct}%)</span>`;
                }
                
                if (useEMA) {
                    const emaPeriod = (meta.params?.ema) || (prefix === 'lab' ? parseInt(document.getElementById('lab-ema').value) : 50);
                    const emaValues = calculateEMAVector(prices, emaPeriod);
                    let bearDays = 0;
                    for(let i = startIdx; i <= endIdx; i++) if (prices[i] < emaValues[i]) bearDays++;
                    const pct = ((bearDays / totalDays) * 100).toFixed(1);
                    metaContainer.innerHTML += `<span class="pill-badge active" style="background:rgba(255,160,0,0.1); border-color:var(--orange); color:#ffa000">EMA ${emaPeriod} (Target: ${modeStr}): ${bearDays.toLocaleString()} Days Protected (${pct}%)</span>`;
                }
            }

            if (!useSMA && !useEMA) {
                metaContainer.innerHTML += '<span class="pill-badge" style="opacity:0.5">No Trend Filter (Always 100% Active)</span>';
            }
        }
        if (textContainer && meta.text) {
            textContainer.innerHTML = `<p class="strategy-description">${meta.text}</p>`;
        } else if (textContainer) {
            textContainer.innerHTML = `<p class="strategy-description" style="opacity:0.5; font-style:italic">No methodology description available for this strategy.</p>`;
        }


        let weights = entry.weights;
        if (prefix === 'lab') {
            weights = labWeights.map(r => {
                const rowSum = (r.VOO + r.VOO2 + r.VOO4 + r.DJP + r.BILL) || 100;
                return [
                    (r.VOO / rowSum) * 100,
                    (r.VOO2 / rowSum) * 100,
                    (r.VOO4 / rowSum) * 100,
                    (r.DJP / rowSum) * 100,
                    (r.BILL / rowSum) * 100
                ];
            });
        }

        let b = entry.bounds;
        if (prefix === 'lab' || name === '🧪 USER CUSTOM LAB') {
            b = [
                parseFloat(document.getElementById('lab-b1').value),
                parseFloat(document.getElementById('lab-b2').value),
                parseFloat(document.getElementById('lab-b3').value),
                parseFloat(document.getElementById('lab-b4').value)
            ]; // Values are already percentages from inputs
        }

        let tableHtml = `<table class="weights-table-explorer"><thead><tr><th>Tier / Drawdown</th><th>VOO</th><th>VOO (2x)</th><th>VOO (4x)</th><th>DJP</th><th>BILL</th><th>Lev</th></tr></thead><tbody>`;
        weights.forEach((w, i) => {
            const lev = (w[0] * 1 + w[1] * 2 + w[2] * 4 + w[3] * 1) / 100;
            
            let rangeStr = (i === 0) ? `0 – ${b[0].toFixed(1)}%` : (i === 4) ? `> ${b[3].toFixed(1)}%` : `${b[i - 1].toFixed(1)} – ${b[i].toFixed(1)}%`;
            
            const modeStr = meta.smaMode || (prefix === 'lab' ? document.getElementById('lab-sma-mode').value : 'T0');
            const targetTier = modeStr.startsWith('T') ? parseInt(modeStr[1]) : -99;
            const isTrendTarget = ((useSMA || useEMA) && i === targetTier);
            
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
    // Calculate and render Unified Analytics Strip
    const startVal = document.getElementById('start-date').value;
    const endVal = document.getElementById('end-date').value;
    const startIdx = globalData.dates.findIndex(d => d >= startVal);
    const endIdx = globalData.dates.findLastIndex(d => d <= endVal);

    if (startIdx === -1 || endIdx === -1) return;
    
    // Benchmarks
    const bRaw = globalData.raw_returns['VOO'].slice(startIdx, endIdx + 1);
    const rfRaw = globalData.raw_returns['BILL'].slice(startIdx, endIdx + 1);
    const pRaw = (name === '🧪 USER CUSTOM LAB' ? window.customStrategyResult.returns : globalData.variants[name]).slice(startIdx, endIdx + 1);
    
    const calculateEdgeStats = (rets) => {
        const pos = rets.filter(r => r > 0);
        const neg = rets.filter(r => r < 0);
        
        return {
            expectancy: rets.reduce((a, b) => a + b, 0) / rets.length
        };
    };

    const calculateLogistics = (lev) => {
        let pivots = 0;
        for (let i = 1; i < lev.length; i++) if (lev[i] !== lev[i-1]) pivots++;
        const yrs = lev.length / 252;
        return {
            totalPivots: pivots,
            tradesPerMonth: pivots / (yrs * 12 || 1),
            avgLeverage: lev.reduce((a, b) => a + b, 0) / lev.length
        };
    };

    const ratios = calculateAdvancedRiskRatios(pRaw, bRaw, rfRaw);
    Object.assign(ratios, calculateLogistics(levSlice));
    Object.assign(ratios, calculateEdgeStats(pRaw));

    let ratiosCompare = null;
    if (mCompare) {
        const cRaw = (compareName === '🧪 USER CUSTOM LAB' ? window.customStrategyResult.returns : globalData.variants[compareName]).slice(startIdx, endIdx + 1);
        const cLev = (compareName === '🧪 USER CUSTOM LAB' ? window.customStrategyResult.leverage : globalData.leverage[compareName]).slice(startIdx, endIdx + 1);
        ratiosCompare = calculateAdvancedRiskRatios(cRaw, bRaw, rfRaw);
        Object.assign(ratiosCompare, calculateLogistics(cLev));
        Object.assign(ratiosCompare, calculateEdgeStats(cRaw));
    }

    renderUnifiedAnalyticsStrip(`${prefix}-analytics-strip`, m, ratios, mCompare, ratiosCompare);




    const inflationNorm = globalData.inflation.slice(startIndex).map((v, i, a) => v / a[0]);
    const chartReal = chartReturns.map((v, i) => v / inflationNorm[i]); const cReal = cReturns ? cReturns.map((v, i) => v / inflationNorm[i]) : null;
    Plotly.react(`chart-${prefix}-real`, traces(chartReal, cReal, name, compareName, 'var(--green)'), { ...expBaseLayout, yaxis: { title: 'Real Growth (Log)', type: 'log' }, height: 450 }, PLOTLY_CONFIG);
    const getYearly = (sName, sI) => { const full = (sName === '🧪 USER CUSTOM LAB' ? window.customStrategyResult.returns : globalData.variants[sName]); const slice = full.slice(sI); const map = {}; slice.forEach((ret, i) => { if (i < syncedDates.length) { const y = syncedDates[i].substring(0, 4); map[y] = (map[y] || 1.0) * (1 + ret); } }); return map; };
    const pY = getYearly(name, startIndex); const cY = compareName ? getYearly(compareName, globalData.dates.length - chartReturns.length) : null; const years = Object.keys(pY).sort();
    const yTraces = [{ x: years, y: years.map(y => pY[y] - 1), name, type: 'bar', marker: { color: m.color }, hoverinfo: 'none' }];
    if (cY) yTraces.push({ x: Object.keys(cY).sort(), y: Object.keys(cY).sort().map(y => cY[y] - 1), name: compareName, type: 'bar', marker: { color: 'rgba(255,255,255,0.2)' }, hoverinfo: 'none' });
    Plotly.react(`chart-${prefix}-yearly`, yTraces, { ...expBaseLayout, barmode: 'group', yaxis: { title: 'Yearly Return (%)', tickformat: '.0%' }, height: 450 }, PLOTLY_CONFIG);
    
    renderMechanismChart(prefix, name, startIndex, globalData.dates.length - 1);
    
    initTooltipEngine([`chart-${prefix}-linear`, `chart-${prefix}-log`, `chart-${prefix}-drawdown`, `chart-${prefix}-vol`, `chart-${prefix}-leverage`, `chart-${prefix}-real`, `chart-${prefix}-yearly`, `chart-${prefix}-mechanism`]);
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
    
    let dailyTier = 0;
    if (dd >= b[3]) dailyTier = 4; 
    else if (dd >= b[2]) dailyTier = 3; 
    else if (dd >= b[1]) dailyTier = 2; 
    else if (dd >= b[0]) dailyTier = 1;
    
    if (dd === 0) simMaxTierReached = 0; 
    else if (dailyTier > simMaxTierReached) simMaxTierReached = dailyTier;

    let effectiveTier = isRatchet ? simMaxTierReached : dailyTier;

    document.getElementById('sim-daily-state').textContent = `Tier ${dailyTier}`;
    document.getElementById('sim-ratchet-state').textContent = `Tier ${simMaxTierReached}`;
    
    const decisionEngine = document.querySelector('.decision-engine h4');
    if (decisionEngine) {
        decisionEngine.innerHTML = `
            <div style="display:flex; justify-content:space-between; width:100%; align-items:center">
                <span style="color:var(--accent)">Decision Engine</span>
                <div style="font-size:0.6rem; text-align:right">
                    <div style="color:var(--text-secondary)">Pure State Logic</div>
                    <div style="opacity:0.7">No Filter Overlays</div>
                </div>
            </div>
        `;
    }
    
    const ratchetEl = document.getElementById('sim-ratchet-state');
    if (ratchetEl) {
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
        
        // Execution is where we ACTUALLY are (In simulator, it's just the dailyTier)
        if (id === dailyTier) n.classList.add('active-execution');
    });
    document.querySelectorAll('#flow-svg-daily .flow-path').forEach(p => p.classList.remove('active'));
    
    const dailyExecLimit = dailyTier;
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
        let tableHtml = `<table class="excel-table" style="width:100%"><thead><tr><th>Tier</th><th>VOO</th><th>VOO (2x)</th><th>VOO (4x)</th><th>DJP</th><th>BILL</th><th>Total</th><th>Lev</th></tr></thead><tbody>`;
        const meta = parseStrategy(selectedName);
        const smaMode = (selectedName === '🧪 USER CUSTOM LAB') ? document.getElementById('lab-sma-mode').value : (meta.smaMode || 'T0');
        const targetTier = (meta.isTrend || (selectedName === '🧪 USER CUSTOM LAB')) ? (smaMode.startsWith('T') ? parseInt(smaMode[1]) : -99) : -99;

        entry.weights.forEach((w, i) => {
            const lev = (w[0] * 1 + w[1] * 2 + w[2] * 4 + w[3] * 1) / 100;
            const sum = w.reduce((s, v) => s + v, 0);
            const isEff = (i === effectiveTier);
            const isDaily = (i === dailyTier && !isEff);
            const isTrendTarget = (i === targetTier);

            tableHtml += `<tr class="${isEff ? 'active-execution' : ''} ${isDaily ? 'active-market' : ''}">
                <td class="tier-label">
                    T${i}
                    ${isTrendTarget ? '<div class="trend-tag" style="position:static; margin-top:4px; font-size:0.55rem">SMA Safety Target</div>' : ''}
                </td>
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
function switchTab(tabId, pushState = true) {
    currentTab = tabId;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.remove('active');
        if (n.dataset.tab === tabId) n.classList.add('active');
    });
    update();
    if (tabId === 'explorer') updateExplorer();
    if (tabId === 'simulator') updateSimulator();
    if (pushState) syncStateToUrl(true);
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

        picker.onchange = () => { updateExplorer(); syncStateToUrl(true); };
        comparePicker.onchange = () => { updateExplorer(); syncStateToUrl(true); };
        labCompare.onchange = () => { updateLabResults(); syncStateToUrl(true); };
        if (simPicker) simPicker.onchange = () => { updateSimulator(); syncStateToUrl(true); };

        startInput.onchange = () => { update(); syncStateToUrl(false); };
        endInput.onchange = () => { update(); syncStateToUrl(false); };
        document.getElementById('reset-btn').onclick = () => { startInput.value = dates[0]; endInput.value = dates[dates.length - 1]; update(); };

        // Initialize active filters state for static groups
        activeFilters.level = [...STRATEGY_METADATA.groups];
        activeFilters.logic = [...STRATEGY_METADATA.logics];
        activeFilters.mix = [...STRATEGY_METADATA.mixes];

        // Global pill handler for all groups in index.html (Level, Logic, Mix, TrendType)
        document.querySelectorAll('.filter-toolbar .pill').forEach(p => {
             p.onclick = () => {
                const group = p.parentElement.id.replace('filter-', '');
                const val = p.dataset.value;
                if (p.classList.toggle('active')) {
                    if (!activeFilters[group].includes(val)) activeFilters[group].push(val);
                } else {
                    activeFilters[group] = activeFilters[group].filter(v => v !== val);
                }
                update();
                syncStateToUrl(true);
            };
        });

        document.querySelectorAll('.nav-item').forEach(n => n.onclick = () => switchTab(n.dataset.tab));

        document.getElementById('drawdown-slider').oninput = updateSimulator;
        renderWeightTable();

        document.getElementById('lab-run').onclick = () => runLabSimulation(true);
        document.getElementById('lab-export').onclick = () => exportStrategy();
        document.getElementById('explorer-export').onclick = () => exportExplorerSelection();
        document.getElementById('lab-result-export').onclick = () => exportLabResult();
        document.getElementById('sim-export').onclick = () => exportSimulatorSelection();

        // Modal Controls
        const modal = document.getElementById('export-modal');
        const closeModal = () => modal.style.display = 'none';
        document.getElementById('close-export').onclick = closeModal;
        document.getElementById('close-export-btn').onclick = closeModal;
        window.onclick = (e) => { if (e.target === modal) closeModal(); };

        document.getElementById('copy-export-btn').onclick = () => {
            const textarea = document.getElementById('export-json');
            textarea.select();
            document.execCommand('copy');
            const btn = document.getElementById('copy-export-btn');
            const original = btn.innerHTML;
            btn.innerHTML = '<i class=\"fas fa-check\"></i> Copied!';
            setTimeout(() => btn.innerHTML = original, 2000);
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
        initAnalyticsTooltips();

        // Initial State Sync
        if (location.hash) {
            syncStateFromUrl();
        } else {
            update();
        }

        window.onpopstate = () => {
            syncStateFromUrl();
        };
    } catch (e) {
        console.error('Quant Engine Error:', e);
    }
}


function renderWeightTable() {
    const tbody = document.getElementById('weight-tbody');
    tbody.innerHTML = '';
    labWeights.forEach((row, i) => {
        const tr = document.createElement('tr');
        const assets = ['VOO', 'VOO2', 'VOO4', 'DJP', 'BILL'];
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

// ── Analytics Tooltip Support ──────────────────────────────────────────
function initAnalyticsTooltips() {
    let tooltip = document.getElementById('analytics-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'analytics-tooltip';
        tooltip.className = 'analytics-tooltip';
        document.body.appendChild(tooltip);
    }
}

function showAnalyticsTooltip(e) {
    const tooltip = document.getElementById('analytics-tooltip');
    if (!tooltip) return;

    const t = e.target.dataset.title;
    const m = e.target.dataset.meaning;
    const c = e.target.dataset.calc;

    tooltip.innerHTML = `
        <div class="tooltip-title">${t}</div>
        <div class="tooltip-section">
            <label>Meaning</label>
            <p>${m}</p>
        </div>
        <div class="tooltip-section">
            <label>How is it calculated?</label>
            <p>${c}</p>
        </div>
    `;

    tooltip.style.display = 'block';
    
    const rect = e.target.getBoundingClientRect();
    const tooltipHeight = tooltip.offsetHeight;
    const tooltipWidth = tooltip.offsetWidth;
    
    // Position above the icon
    let top = rect.top - tooltipHeight - 10;
    let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
    
    // Boundary checks
    if (top < 10) top = rect.bottom + 10;
    if (left < 10) left = 10;
    if (left + tooltipWidth > window.innerWidth - 10) left = window.innerWidth - tooltipWidth - 10;

    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
}

function hideAnalyticsTooltip() {
    const tooltip = document.getElementById('analytics-tooltip');
    if (tooltip) tooltip.style.display = 'none';
}

// Call init on load
initAnalyticsTooltips();

function runLabSimulation(pushState = true) {
    const bounds = [
        parseFloat(document.getElementById('lab-b1').value), 
        parseFloat(document.getElementById('lab-b2').value), 
        parseFloat(document.getElementById('lab-b3').value), 
        parseFloat(document.getElementById('lab-b4').value)
    ];
    const smaPeriod = parseInt(document.getElementById('lab-sma').value) || 200;
    const emaPeriod = parseInt(document.getElementById('lab-ema').value) || 50;
    const smaMode = document.getElementById('lab-sma-mode').value;
    
    window.customStrategyResult = simulateCustomStrategy(
        bounds, 
        document.getElementById('lab-ratchet').checked, 
        document.getElementById('lab-trend').checked, 
        smaPeriod, 
        document.getElementById('lab-use-ema').checked, 
        emaPeriod, 
        smaMode
    );
    update();
    updateLabResults();
    if (pushState) {
        syncStateToUrl(true);
        // Visual feedback
        const btn = document.getElementById('lab-run');
        if (btn) {
            const original = btn.innerHTML;
            btn.innerHTML = '<i class=\"fas fa-link\"></i> Link Updated';
            btn.style.borderColor = 'var(--green)';
            btn.style.color = 'var(--green)';
            setTimeout(() => {
                btn.innerHTML = original;
                btn.style.borderColor = '';
                btn.style.color = '';
            }, 2000);
        }
    }
}

function formatStrategyForExport(strat) {
    const b = strat.bounds || [0, 0, 0, 0];
    const w = strat.weights || [[100, 0, 0, 0, 0], [100, 0, 0, 0, 0], [100, 0, 0, 0, 0], [100, 0, 0, 0, 0], [100, 0, 0, 0, 0]];
    const p = strat.params || { logic: 'Daily', sma: 200, ema: 0, smaMode: 'T0' };
    
    // Manually construct string to match strategies.js style precisely
    let js = "{\n";
    js += `    id: '${strat.id || 'Custom Strategy'}',\n`;
    js += `    group: '${strat.group || 'Lab'}',\n`;
    js += `    text: '${strat.text || ('Custom strategy config generated on ' + new Date().toLocaleDateString())}',\n`;
    js += `    bounds: [${b.map(v => v.toFixed(1).replace('.0', '')).join(', ')}],\n`;
    js += `    weights: [\n`;
    js += w.map(row => `        [${row.join(', ')}]`).join(',\n') + '\n';
    js += `    ],\n`;
    js += `    params: { logic: '${p.logic}', sma: ${p.sma}, ema: ${p.ema}, smaMode: '${p.smaMode}' }\n`;
    js += "}";
    return js;
}

function exportStrategy() {
    const bounds = [
        parseFloat(document.getElementById('lab-b1').value) || 0,
        parseFloat(document.getElementById('lab-b2').value) || 0,
        parseFloat(document.getElementById('lab-b3').value) || 0,
        parseFloat(document.getElementById('lab-b4').value) || 0
    ];
    
    const weights = labWeights.map(row => [
        row.VOO, row.VOO2, row.VOO4, row.DJP, row.BILL
    ]);
    
    const stratObj = {
        id: 'USER CUSTOM LAB',
        group: 'Lab',
        bounds: bounds,
        weights: weights,
        params: {
            logic: document.getElementById('lab-ratchet').checked ? "Ratchet" : "Daily",
            sma: parseInt(document.getElementById('lab-sma').value) || 0,
            ema: parseInt(document.getElementById('lab-ema').value) || 0,
            smaMode: document.getElementById('lab-sma-mode').value
        }
    };
    
    document.getElementById('export-json').value = formatStrategyForExport(stratObj);
    document.getElementById('export-modal').style.display = 'flex';
}

function exportExplorerSelection() {
    const name = document.getElementById('explorer-picker').value;
    if (!name) return;
    
    const strat = STRATEGY_REGISTRY_DATA.find(s => s.id === name);
    if (strat) {
        document.getElementById('export-json').value = formatStrategyForExport(strat);
        document.getElementById('export-modal').style.display = 'flex';
    }
}

function exportLabResult() {
    // Current custom weights/bounds from Lab inputs or window.customStrategyResult
    exportStrategy();
}

function exportSimulatorSelection() {
    const name = document.getElementById('sim-strategy-picker').value;
    if (!name) return;
    
    const strat = STRATEGY_REGISTRY_DATA.find(s => s.id === name);
    if (strat) {
        document.getElementById('export-json').value = formatStrategyForExport(strat);
        document.getElementById('export-modal').style.display = 'flex';
    }
}
