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
        params: { logic: 'Daily', sma: 0, ema: 0 }
    },
    {
        id: 'Benchmark SSO (2x)',
        group: 'Benchmark',
        text: 'Standard 2x Leveraged S&P 500 tracking. Constant leverage, no reset.',
        bounds: [0, 0, 0, 0],
        weights: [[0, 100, 0, 0, 0], [0, 100, 0, 0, 0], [0, 100, 0, 0, 0], [0, 100, 0, 0, 0], [0, 100, 0, 0, 0]],
        params: { logic: 'Daily', sma: 0, ema: 0 }
    },
    {
        id: 'Benchmark SPYU (4x)',
        group: 'Benchmark',
        text: 'Aggressive 4x Leveraged S&P 500 tracking. High volatility path.',
        bounds: [0, 0, 0, 0],
        weights: [[0, 0, 100, 0, 0], [0, 0, 100, 0, 0], [0, 0, 100, 0, 0], [0, 0, 100, 0, 0], [0, 0, 100, 0, 0]],
        params: { logic: 'Daily', sma: 0, ema: 0 }
    },
    {
        id: 'Benchmark DJP (1x)',
        group: 'Benchmark',
        text: 'Broad Commodity Tracking Index. Used as a hedge against inflation.',
        bounds: [0, 0, 0, 0],
        weights: [[0, 0, 0, 100, 0], [0, 0, 0, 100, 0], [0, 0, 0, 100, 0], [0, 0, 0, 100, 0], [0, 0, 0, 100, 0]],
        params: { logic: 'Daily', sma: 0, ema: 0 }
    },

    {
        id: 'Benchmark SSO (2x) (With Safety Net)',
        group: 'Benchmark',
        text: 'Aggressive 2x strategy optimized for maximum absolute growth (41x+). Uses a 290-day SMA and pivots to 100% VOO (1x) during bearish regimes to maintain recovery speed.',
        bounds: [0, 0, 0, 0],
        weights: [[100, 0, 0, 0, 0], [0, 100, 0, 0, 0], [0, 100, 0, 0, 0], [0, 100, 0, 0, 0], [0, 100, 0, 0, 0]],
        params: { logic: 'Daily', sma: 290, ema: 0, smaMode: 'T0' }
    },
    {
        id: 'Benchmark SPYU (4x) (With Safety Net)',
        group: 'Benchmark',
        text: 'Hyper-aggressive 4x strategy optimized for maximum wealth generation (191x+). Uses a 290-day SMA and pivots to a 50/50 VOO/BILL mix for high-leverage recovery.',
        bounds: [0, 0, 0, 0],
        weights: [[50, 0, 0, 0, 50], [0, 0, 100, 0, 0], [0, 0, 100, 0, 0], [0, 0, 100, 0, 0], [0, 0, 100, 0, 0]],
        params: { logic: 'Daily', sma: 290, ema: 0, smaMode: 'T0' }
    },

    // === CATEGORY: BASIC LADDERS ===
    {
        id: 'Standard Daily Safeties',
        group: 'Basic',
        text: 'Standard 1x-4x ladder with 20% dedicated to safety nets (DJP/BILL).',
        bounds: [5.0, 10.0, 20.0, 30.0],
        weights: [[80, 0, 0, 10, 10], [40, 40, 0, 10, 10], [0, 80, 0, 10, 10], [0, 40, 40, 10, 10], [0, 0, 100, 0, 0]],
        params: { logic: 'Daily', sma: 200, smaMode: 'T0' }
    },
    {
        id: 'Standard Daily Pure',
        group: 'Basic',
        text: 'Standard 1x-4x equity ladder. No safety nets, maximum recovery leverage.',
        bounds: [5.0, 10.0, 20.0, 30.0],
        weights: [[100, 0, 0, 0, 0], [50, 50, 0, 0, 0], [0, 100, 0, 0, 0], [0, 50, 50, 0, 0], [0, 0, 100, 0, 0]],
        params: { logic: 'Daily', sma: 200, smaMode: 'T0' }
    },
    {
        id: 'Aggressive Daily Safeties',
        group: 'Basic',
        text: 'Aggressive 1x-4x transition with tighter bounds and 20% safety margin.',
        bounds: [3.0, 7.0, 12.0, 20.0],
        weights: [[80, 0, 0, 10, 10], [40, 40, 0, 10, 10], [0, 80, 0, 10, 10], [0, 40, 40, 10, 10], [0, 0, 100, 0, 0]],
        params: { logic: 'Daily', sma: 200, smaMode: 'T0' }
    },
    {
        id: 'Aggressive Daily Pure',
        group: 'Basic',
        text: 'Aggressive 1x-4x pure equity ladder. Ultra-fast ramp up on minor drawdowns.',
        bounds: [3.0, 7.0, 12.0, 20.0],
        weights: [[100, 0, 0, 0, 0], [50, 50, 0, 0, 0], [0, 100, 0, 0, 0], [0, 50, 50, 0, 0], [0, 0, 100, 0, 0]],
        params: { logic: 'Daily', sma: 200, smaMode: 'T0' }
    },
    {
        id: 'Conservative Daily Safeties',
        group: 'Basic',
        text: 'Conservative 1x-4x transition with wide bounds and 20% safety margin.',
        bounds: [10.0, 20.0, 35.0, 50.0],
        weights: [[80, 0, 0, 10, 10], [40, 40, 0, 10, 10], [0, 80, 0, 10, 10], [0, 40, 40, 10, 10], [0, 0, 100, 0, 0]],
        params: { logic: 'Daily', sma: 200, smaMode: 'T0' }
    },
    {
        id: 'Conservative Daily Pure',
        group: 'Basic',
        text: 'Conservative 1x-4x pure equity ladder. Only ramps up during major crashes.',
        bounds: [10.0, 20.0, 35.0, 50.0],
        weights: [[100, 0, 0, 0, 0], [50, 50, 0, 0, 0], [0, 100, 0, 0, 0], [0, 50, 50, 0, 0], [0, 0, 100, 0, 0]],
        params: { logic: 'Daily', sma: 200, smaMode: 'T0' }
    },

    // === CATEGORY: ADVANCED ARCHETYPES ===
    {
        id: 'Advanced THE PHOENIX',
        group: 'Advanced',
        text: 'Rapid-Recapture model. Scaled to max leverage at just 4% drawdown to catch the exact meat of V-recoveries.',
        bounds: [2.0, 4.0, 6.0, 10.0],
        weights: [
            [100, 0, 0, 0, 0], // Bench
            [50, 50, 0, 0, 0], // Tier 1
            [0, 0, 100, 0, 0], // Tier 2 (4x)
            [0, 0, 100, 0, 0], // Tier 3 (4x)
            [0, 0, 100, 0, 0]  // Tier 4 (4x)
        ],
        params: { logic: 'Daily', sma: 200, smaMode: 'T0' }
    },
    {
        id: 'Advanced THE KRAKEN',
        group: 'Advanced',
        text: 'Hedged Momentum model. Aggressive equity ladder that shifts 100% to DJP (Commodities) during terminal drawdowns (>25%).',
        bounds: [3.0, 7.0, 15.0, 25.0],
        weights: [
            [100, 0, 0, 0, 0],
            [0, 100, 0, 0, 0],
            [0, 50, 50, 0, 0],
            [0, 0, 100, 0, 0],
            [0, 0, 0, 100, 0] // Shift to DJP
        ],
        params: { logic: 'Daily', sma: 200, smaMode: 'T0' }
    },
    {
        id: 'Advanced THE SPECTRE',
        group: 'Advanced',
        text: 'Momentum Shadow model. Uses Ratchet logic to lock in leverage gains but maintains a HARD STOP to Cash when below SMA 200.',
        bounds: [2.0, 5.0, 10.0, 20.0],
        weights: [[100, 0, 0, 0, 0], [50, 50, 0, 0, 0], [0, 100, 0, 0, 0], [0, 50, 50, 0, 0], [0, 0, 100, 0, 0]],
        params: { logic: 'Ratchet', sma: 200, smaMode: 'Cash' }
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
        params: { logic: 'Daily', sma: 200, smaMode: 'T0' }
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
        params: { logic: 'Daily', sma: 200, ema: 0, smaMode: 'T0' }
    }
];

// Metadata for UI buckets (high-level grouping only)
const STRATEGY_METADATA = {
    groups: ['Benchmark', 'Special', 'Advanced', 'Basic'],
    logics: ['Daily', 'Ratchet'],
    mixes: ['Safeties', 'Pure']
};

window.STRATEGY_REGISTRY_DATA = STRATEGY_REGISTRY_DATA;
window.STRATEGY_METADATA = STRATEGY_METADATA;
