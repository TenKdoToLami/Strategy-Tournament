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
        id: 'Legacy BEAST',
        group: 'Special',
        text: 'The original genetic champion. Optimized for long-term consistency and CAGR recovery using a classic 200-day trend filter.',
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
        id: 'Special BEAST (v2)',
        group: 'Special',
        text: 'The God Mode Apex. Evolved via 50-epoch deep-search. Discovered an ultimate 1,530x growth path using a 362/400-day Trend Hybrid and specialized aggression in Tier 4 recovery.',
        bounds: [1, 10, 27, 71],
        weights: [
            [0, 0, 0, 100, 0],
            [0, 0, 100, 0, 0],
            [0, 0, 0, 0, 100],
            [0, 0, 100, 0, 0],
            [45, 20, 23, 11, 1]
        ],
        params: { logic: 'Daily', sma: 362, ema: 400, smaMode: 'T4' }
    },
    {
        id: 'Special SCALPEL (v2)',
        group: 'Special',
        text: 'The Efficiency Master. Optimized for Sharpe ratio and recovery speed. Uses a 291-day SMA and pivots to a defensive T4 Cash-heavy position.',
        bounds: [26, 33, 34, 44],
        weights: [
            [1, 2, 1, 95, 1],
            [0, 36, 45, 0, 19],
            [27, 49, 12, 3, 9],
            [44, 0, 37, 14, 5],
            [2, 3, 2, 2, 91]
        ],
        params: { logic: 'Daily', sma: 291, smaMode: 'T4' }
    },
    {
        id: 'Special PREDATOR',
        group: 'Special',
        text: 'Evolved Robust Optimizer. Predator dominates the modern era, winning 88% of all monthly entry points against the BEAST since 2020. Utilizing an ultra-resilient 290-day trend logic, it is designed to thrive where standard strategies fail.',
        bounds: [1, 5, 55, 60],
        weights: [
            [13, 22, 1, 0, 64],
            [0, 0, 100, 0, 0],
            [0, 0, 85, 15, 0],
            [12, 11, 3, 17, 57],
            [42, 1, 8, 24, 25]
        ],
        params: { logic: 'Daily', sma: 290, ema: 0, smaMode: 'T0' }
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
