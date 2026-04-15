# 📊 Dynamic Drawdown Strategy Tournament

A high-performance, interactive backtesting dashboard that evaluates **dynamic drawdown-based leveraging strategies** across multiple market cycles. Hosted as a static site on GitHub Pages with daily auto-updates.

🔗 **[Live Dashboard →](https://tenkdotolami.github.io/Strategy-Tournament/)**

---

## Overview

This tool compares **14 strategy variants** — differing in leverage bounds, rebalancing frequency, and asset composition — against the S&P 500. The core idea: **buy more leverage when the market is deeply discounted, de-leverage when near all-time highs**.

All simulations begin on **July 1, 2002**, capturing:
- The post-dot-com recovery (2002–2007)
- The 2008 Global Financial Crisis
- The 2020 COVID crash & recovery
- The 2022 bear market

All returns are **Total Return** (dividends and interest reinvested).

---

## Data Sources

| Asset | Ticker Proxy | Role |
|:------|:-------------|:-----|
| **VOO** (S&P 500) | SPY | 1x Core Equity |
| **SSO** (2x S&P 500) | *Simulated* | 2x Leveraged Equity |
| **SPYU** (4x S&P 500) | *Simulated* | 4x Leveraged Equity |
| **BILL** (Treasury Bonds) | VFISX | Cash-equivalent safe haven |
| **DJP** (Commodities) | PCRIX | Inflation hedge |

Leveraged returns are simulated as:
```
Return = (Leverage × SPY_Return) − ((Leverage − 1) × Bond_Return)
```
This models the real-world borrowing cost of maintaining a leveraged position.

---

## Asset Allocation Tier Matrices

Each strategy dynamically shifts portfolio weights based on the **previous day's drawdown** (distance from All-Time High). Using yesterday's data prevents look-ahead bias.

### Standard Variants (20% Safety Net)
These hold 10% Bonds + 10% Commodities in Tiers 0–3 as a volatility dampener.

| Tier | Drawdown Range | VOO (1x) | SSO (2x) | SPYU (4x) | DJP | BILL | Eff. Leverage |
|:-----|:---------------|:---------|:---------|:----------|:----|:-----|:--------------|
| **Safe (T0)** | 0% to −5% | 80% | 0% | 0% | 10% | 10% | ~0.8x |
| **T1** | −5% to −10% | 60% | 20% | 0% | 10% | 10% | ~1.0x |
| **T2** | −10% to −20% | 30% | 25% | 25% | 10% | 10% | ~1.8x |
| **T3** | −20% to −30% | 10% | 35% | 35% | 10% | 10% | ~2.2x |
| **T4** | > −30% | 0% | 50% | 50% | 0% | 0% | **3.0x** |

### Pure Equity Variants (No Safety Net)
100% equity allocation. Higher potential returns, higher crash risk.

| Tier | Drawdown Range | VOO (1x) | SSO (2x) | SPYU (4x) | DJP | BILL | Eff. Leverage |
|:-----|:---------------|:---------|:---------|:----------|:----|:-----|:--------------|
| **Safe (T0)** | 0% to −5% | 100% | 0% | 0% | 0% | 0% | 1.0x |
| **T1** | −5% to −10% | 75% | 25% | 0% | 0% | 0% | 1.25x |
| **T2** | −10% to −20% | 38% | 31% | 31% | 0% | 0% | ~1.9x |
| **T3** | −20% to −30% | 12% | 44% | 44% | 0% | 0% | ~2.6x |
| **T4** | > −30% | 0% | 50% | 50% | 0% | 0% | **3.0x** |

---

## Strategy Descriptions

### Standard (0/5/10/20/30)
The baseline dynamic strategy. Uses the standard tier matrix with drawdown bounds at 5%, 10%, 20%, and 30%. Rebalances **daily**. Includes the 20% safety net (Bonds + Commodities). This is the "balanced workhorse."

### Standard Pure Equity
Same bounds as Standard (5/10/20/30) but uses the **Pure Equity** matrix (100% stock exposure at all times). No bonds or commodities.

### Ratchet Standard
Same tier matrix as Standard, but with **path-dependent lock-in logic**. Once the market crashes and the strategy enters a higher tier (e.g., Tier 3 at −20%), it *refuses to de-leverage* even if the market bounces to −5%. It only resets to Tier 0 when a **brand new All-Time High (0% drawdown)** is reached. This captures the full recovery rally.

### Ratchet Pure Equity
Same ratchet lock-in logic, but with 100% equities (no bonds/commodities). Maximum aggression during recoveries. Highest potential return but also the most volatile.

### Pure Equities (No Bonds)
Standard de-leverage logic (no ratchet), but with no safety net. 100% allocated to equities at all times. This is the same as **Standard Pure Equity**.

### Aggressive (0/3/7/12/20)
Uses much tighter drawdown bounds: 3%, 7%, 12%, 20%. Leverage kicks in *much earlier* during small dips. Can over-leverage during prolonged declines. Includes the 20% safety net.

### Conservative (0/10/20/35/50)
Uses very wide drawdown bounds: 10%, 20%, 35%, 50%. This "patient hunter" barely leverages up until a major crash occurs. Lower overall returns but excellent crash survival. Includes the 20% safety net.

### Conservative Pure Equity
Same wide bounds as Conservative (10/20/35/50) but with 100% equity exposure. No safety net.

### Conservative Ratchet
Combines the patient Conservative bounds (10/20/35/50) with the **Ratchet** lock-in logic. It waits for the crash, leverages up, and then "ratchets" that leverage all the way back to the recovery peak. Includes the 20% safety net.

### Conservative Ratchet Pure
The most extreme "patient recovery" play. Uses Conservative bounds, Ratchet lock-in, and 100% equity exposure. It stays quiet during small dips but becomes a monster during major bear market recoveries.

### Benchmarks: S&P 500 (1x), SSO (2x), SPYU (4x)
Static buy-and-hold positions for comparison. The leveraged benchmarks include simulated borrowing costs and demonstrate the effect of daily compounding drag.

---

## Rebalancing Rules

| Frequency | How It Works | Trade-Off |
|:----------|:-------------|:----------|
| **Daily** | Recalculates drawdown and shifts weights every business day. | Most responsive, but highest transaction cost. |
| **Monthly** | Samples the drawdown signal on the last trading day of each month. | Lower costs, but can miss intra-month moves. |
| **Ratchet** | Locks in the *highest* tier reached. Never de-leverages until a new ATH. | Maximum recovery capture, but stays leveraged during false bounces. |

---

## Risk Controls

### Trend Filter (200-day SMA)
If the S&P 500 price closes **below its 200-day Simple Moving Average**, all strategies automatically revert to the **Safe Tier (T0)**. This overrides both the drawdown tiers *and* the ratchet lock-in. Being below the 200-day SMA signals a structural bear market where leverage is dangerous.

### Look-Ahead Bias Prevention
All signals (drawdown level, SMA comparison) use the **previous day's close** via `shift(1)`. Every trade decision uses only information that was available at the time.

---

## Performance Indicators (KPIs)

| Indicator | Formula | What It Tells You |
|:----------|:--------|:------------------|
| **Total %** | (Final ÷ Initial) − 1 | Raw percentage growth. 500% means $1 → $6. |
| **CAGR** | Final^(1/Years) − 1 | **Compound Annual Growth Rate**. Smoothed yearly return. Best single number for comparison. |
| **Avg Ann Ret** | Mean(Daily) × 252 | **Average Annual Return**. Arithmetic mean, annualized. Usually higher than CAGR due to volatility drag. |
| **Max DD** | Min((Value − Peak) ÷ Peak) | **Maximum Drawdown**. Deepest peak-to-trough decline. The worst pain experienced. |
| **Sharpe** | (CAGR − 2%) ÷ Ann. Vol | **Sharpe Ratio**. Risk-adjusted return. Above 0.5 = decent, above 1.0 = excellent. |
| **Ann. Vol** | Std(Daily) × √252 | **Annualized Volatility**. Intensity of daily swings. S&P 500 ≈ 19%, 4x ≈ 75%. |

---

## How to Use the Dashboard

1. **Select a date range** using the date pickers. Charts and metrics recalculate instantly.
2. **Click any column header** in the leaderboard to sort by that metric.
3. **Top chart (Linear %)**: Cumulative return as a percentage. Best for comparing final outcomes.
4. **Bottom chart (Log Scale)**: Growth on a logarithmic scale. A straight line = consistent compounding.
5. **Hover over lines** for exact values at any point in time.
6. **Reset** to return to the full historical view.

---

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS + Plotly.js
- **Backend**: Python (pandas, yfinance, numpy) — runs as a precomputation step
- **Hosting**: GitHub Pages (static site)
- **Automation**: GitHub Actions runs `precompute.py` nightly to refresh `data.json`

## Local Development

```bash
# Generate the data
pip install pandas yfinance numpy
python precompute.py

# Serve locally (required for fetch() to work)
python -m http.server 8000
# Open http://localhost:8000
```

---

## License

MIT
