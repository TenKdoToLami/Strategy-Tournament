/**
 * Strategy Registry
 * 
 * Centralized Configuration for all Portfolio Strategies.
 * This file is SHARED between the Web Dashboard and Python Simulation scripts.
 * DO NOT change the structure of the STRATEGY_REGISTRY_DATA array without updating the Python parser.
 */

const STRATEGY_REGISTRY_DATA = [
    // === CATEGORY: BENCHMARKS ===
    {
        id: 'Benchmark SPY (1x)',
        group: 'Benchmark',
        text: 'Standard S&P 500 Index tracking. No leverage, no hedging.',
        bounds: [0, 0, 0, 0],
        weights: [[100, 0, 0, 0, 0], [100, 0, 0, 0, 0], [100, 0, 0, 0, 0], [100, 0, 0, 0, 0], [100, 0, 0, 0, 0]],
        params: { logic: 'Daily', mix: 'Pure', sma: 0 }
    },
    {
        id: 'Benchmark SSO (2x)',
        group: 'Benchmark',
        text: 'Standard 2x Leveraged S&P 500 tracking. Constant leverage, no reset.',
        bounds: [0, 0, 0, 0],
        weights: [[0, 100, 0, 0, 0], [0, 100, 0, 0, 0], [0, 100, 0, 0, 0], [0, 100, 0, 0, 0], [0, 100, 0, 0, 0]],
        params: { logic: 'Daily', mix: 'Pure', sma: 0 }
    },
    {
        id: 'Benchmark SPYU (4x)',
        group: 'Benchmark',
        text: 'Aggressive 4x Leveraged S&P 500 tracking. High volatility path.',
        bounds: [0, 0, 0, 0],
        weights: [[0, 0, 100, 0, 0], [0, 0, 100, 0, 0], [0, 0, 100, 0, 0], [0, 0, 100, 0, 0], [0, 0, 100, 0, 0]],
        params: { logic: 'Daily', mix: 'Pure', sma: 0 }
    },
    {
        id: 'Benchmark DJP (1x)',
        group: 'Benchmark',
        text: 'Broad Commodity Tracking Index. Used as a hedge against inflation.',
        bounds: [0, 0, 0, 0],
        weights: [[0, 0, 0, 100, 0], [0, 0, 0, 100, 0], [0, 0, 0, 100, 0], [0, 0, 0, 100, 0], [0, 0, 0, 100, 0]],
        params: { logic: 'Daily', mix: 'Pure', sma: 0 }
    },

    {
        id: 'Benchmark SSO (2x) + SMA',
        group: 'Benchmark',
        text: '2x Leveraged benchmark that de-risks to 1x SPY when price is below the SMA 200.',
        bounds: [0, 0, 0, 0],
        weights: [[100, 0, 0, 0, 0], [0, 100, 0, 0, 0], [0, 100, 0, 0, 0], [0, 100, 0, 0, 0], [0, 100, 0, 0, 0]],
        params: { logic: 'Daily', mix: 'Pure', sma: 200 }
    },
    {
        id: 'Benchmark SPYU (4x) + SMA',
        group: 'Benchmark',
        text: '4x Leveraged benchmark that de-risks to 1x SPY when price is below the SMA 200.',
        bounds: [0, 0, 0, 0],
        weights: [[100, 0, 0, 0, 0], [0, 0, 100, 0, 0], [0, 0, 100, 0, 0], [0, 0, 100, 0, 0], [0, 0, 100, 0, 0]],
        params: { logic: 'Daily', mix: 'Pure', sma: 200 }
    },

    // === CATEGORY: STANDARD ===
    {
        id: 'Standard Daily Safeties',
        group: 'Standard',
        text: 'Standard 1x-4x ladder with 20% dedicated to safety nets (DJP/BILL).',
        bounds: [5.0, 10.0, 20.0, 30.0],
        weights: [[80, 0, 0, 10, 10], [40, 40, 0, 10, 10], [0, 80, 0, 10, 10], [0, 40, 40, 10, 10], [0, 0, 100, 0, 0]],
        params: { logic: 'Daily', mix: 'Safeties', sma: 200 }
    },
    {
        id: 'Standard Daily Pure',
        group: 'Standard',
        text: 'Standard 1x-4x equity ladder. No safety nets, maximum recovery leverage.',
        bounds: [5.0, 10.0, 20.0, 30.0],
        weights: [[100, 0, 0, 0, 0], [50, 50, 0, 0, 0], [0, 100, 0, 0, 0], [0, 50, 50, 0, 0], [0, 0, 100, 0, 0]],
        params: { logic: 'Daily', mix: 'Pure', sma: 200 }
    },
    {
        id: 'Standard Ratchet Safeties',
        group: 'Standard',
        text: 'Standard 1x-4x Safeties with Ratchet logic (locks in leverage level).',
        bounds: [5.0, 10.0, 20.0, 30.0],
        weights: [[80, 0, 0, 10, 10], [40, 40, 0, 10, 10], [0, 80, 0, 10, 10], [0, 40, 40, 10, 10], [0, 0, 100, 0, 0]],
        params: { logic: 'Ratchet', mix: 'Safeties', sma: 200 }
    },
    {
        id: 'Standard Ratchet Pure',
        group: 'Standard',
        text: 'Standard 1x-4x Pure with Ratchet logic (locks in leverage level).',
        bounds: [5.0, 10.0, 20.0, 30.0],
        weights: [[100, 0, 0, 0, 0], [50, 50, 0, 0, 0], [0, 100, 0, 0, 0], [0, 50, 50, 0, 0], [0, 0, 100, 0, 0]],
        params: { logic: 'Ratchet', mix: 'Pure', sma: 200 }
    },

    // === CATEGORY: AGGRESSIVE ===
    {
        id: 'Aggressive Daily Safeties',
        group: 'Aggressive',
        text: 'Aggressive 1x-4x transition with tighter bounds and 20% safety margin.',
        bounds: [3.0, 7.0, 12.0, 20.0],
        weights: [[80, 0, 0, 10, 10], [40, 40, 0, 10, 10], [0, 80, 0, 10, 10], [0, 40, 40, 10, 10], [0, 0, 100, 0, 0]],
        params: { logic: 'Daily', mix: 'Safeties', sma: 200 }
    },
    {
        id: 'Aggressive Daily Pure',
        group: 'Aggressive',
        text: 'Aggressive 1x-4x pure equity ladder. Ultra-fast ramp up on minor drawdowns.',
        bounds: [3.0, 7.0, 12.0, 20.0],
        weights: [[100, 0, 0, 0, 0], [50, 50, 0, 0, 0], [0, 100, 0, 0, 0], [0, 50, 50, 0, 0], [0, 0, 100, 0, 0]],
        params: { logic: 'Daily', mix: 'Pure', sma: 200 }
    },
    {
        id: 'Aggressive Ratchet Safeties',
        group: 'Aggressive',
        text: 'Aggressive 1x-4x Safeties with Ratchet logic.',
        bounds: [3.0, 7.0, 12.0, 20.0],
        weights: [[80, 0, 0, 10, 10], [40, 40, 0, 10, 10], [0, 80, 0, 10, 10], [0, 40, 40, 10, 10], [0, 0, 100, 0, 0]],
        params: { logic: 'Ratchet', mix: 'Safeties', sma: 200 }
    },
    {
        id: 'Aggressive Ratchet Pure',
        group: 'Aggressive',
        text: 'Aggressive 1x-4x Pure with Ratchet logic.',
        bounds: [3.0, 7.0, 12.0, 20.0],
        weights: [[100, 0, 0, 0, 0], [50, 50, 0, 0, 0], [0, 100, 0, 0, 0], [0, 50, 50, 0, 0], [0, 0, 100, 0, 0]],
        params: { logic: 'Ratchet', mix: 'Pure', sma: 200 }
    },

    // === CATEGORY: CONSERVATIVE ===
    {
        id: 'Conservative Daily Safeties',
        group: 'Conservative',
        text: 'Conservative 1x-4x transition with wide bounds and 20% safety margin.',
        bounds: [10.0, 20.0, 35.0, 50.0],
        weights: [[80, 0, 0, 10, 10], [40, 40, 0, 10, 10], [0, 80, 0, 10, 10], [0, 40, 40, 10, 10], [0, 0, 100, 0, 0]],
        params: { logic: 'Daily', mix: 'Safeties', sma: 200 }
    },
    {
        id: 'Conservative Daily Pure',
        group: 'Conservative',
        text: 'Conservative 1x-4x pure equity ladder. Only ramps up during major crashes.',
        bounds: [10.0, 20.0, 35.0, 50.0],
        weights: [[100, 0, 0, 0, 0], [50, 50, 0, 0, 0], [0, 100, 0, 0, 0], [0, 50, 50, 0, 0], [0, 0, 100, 0, 0]],
        params: { logic: 'Daily', mix: 'Pure', sma: 200 }
    },
    {
        id: 'Conservative Ratchet Safeties',
        group: 'Conservative',
        text: 'Conservative 1x-4x Safeties with Ratchet logic.',
        bounds: [10.0, 20.0, 35.0, 50.0],
        weights: [[80, 0, 0, 10, 10], [40, 40, 0, 10, 10], [0, 80, 0, 10, 10], [0, 40, 40, 10, 10], [0, 0, 100, 0, 0]],
        params: { logic: 'Ratchet', mix: 'Safeties', sma: 200 }
    },
    {
        id: 'Conservative Ratchet Pure',
        group: 'Conservative',
        text: 'Conservative 1x-4x Pure with Ratchet logic.',
        bounds: [10.0, 20.0, 35.0, 50.0],
        weights: [[100, 0, 0, 0, 0], [50, 50, 0, 0, 0], [0, 100, 0, 0, 0], [0, 50, 50, 0, 0], [0, 0, 100, 0, 0]],
        params: { logic: 'Ratchet', mix: 'Pure', sma: 200 }
    },

    // === CATEGORY: SPECIAL (HALL OF FAME) ===
    {
        id: 'Special BEAST',
        group: 'Special',
        text: 'The Ultimate Optimizer. High precision bounds for peak CAGR recovery.',
        bounds: [1.0, 5.0, 9.0, 53.0],
        weights: [
            [38, 21, 1, 40, 0],
            [0, 0, 100, 0, 0],
            [0, 0, 0, 100, 0],
            [0, 0, 100, 0, 0],
            [13, 0, 9, 48, 30]
        ],
        params: { logic: 'Daily', mix: 'Safeties', sma: 200 }
    },
    {
        id: 'Special SCALPEL',
        group: 'Special',
        text: 'Precision timing focused on extreme recovery leverage.',
        bounds: [1.0, 5.0, 30.0, 60.0],
        weights: [
            [13, 2, 0, 7, 78],
            [59, 3, 0, 32, 6],
            [6, 7, 0, 81, 6],
            [25, 9, 22, 20, 24],
            [87, 10, 0, 3, 0]
        ],
        params: { logic: 'Daily', mix: 'Pure', sma: 200, smaMode: 'T0' }
    },
    {
        id: 'Special SHIELD',
        group: 'Special',
        text: 'Maximizes risk-mitigation using BILL/DJP during stability.',
        bounds: [5.0, 10.0, 39.0, 58.0],
        weights: [
            [1, 7, 1, 0, 91],
            [4, 0, 0, 80, 16],
            [2, 22, 0, 1, 75],
            [73, 0, 20, 5, 2],
            [1, 34, 1, 63, 1]
        ],
        params: { logic: 'Daily', mix: 'Safeties', sma: 200, smaMode: 'Cash' }
    }
];

// Metadata for UI generation
const STRATEGY_METADATA = {
    groups: ['Benchmark', 'Standard', 'Aggressive', 'Conservative', 'Special'],
    logics: ['Daily', 'Ratchet'],
    mixes: ['Safeties', 'Pure'],
    sma: ['SMA 200', 'None'],
    smaModes: ['T0', 'Cash']
};

window.STRATEGY_REGISTRY_DATA = STRATEGY_REGISTRY_DATA;
window.STRATEGY_METADATA = STRATEGY_METADATA;
