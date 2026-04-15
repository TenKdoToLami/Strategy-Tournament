# 📊 Dynamic Drawdown Strategy Tournament

A high-performance, interactive backtesting suite that evaluates **dynamic drawdown-based leveraging strategies** across multiple market cycles. This tool combines modern quantitative finance with a "Strategy Laboratory" for real-time browser-side simulation.

🔗 **[Live Dashboard →](https://tenkdotolami.github.io/Strategy-Tournament/)**

---

## 🔥 Key Features

- **Interactive Strategy Laboratory**: Design your own strategy in the browser. Adjust drawdown tiers and asset weights in a live 5x5 matrix.
- **Macro-Economic Context**: Integrated **FRED (Federal Reserve)** data for the US Consumer Price Index (CPI-U).
- **Real Returns Suite**: Automatically adjust performance charts for inflation to see "Constant Dollar" purchasing power growth.
- **High-Resolution Data**: Daily rebalancing simulations across 21+ years of historical data.
- **Adaptive Visualization**: High-contrast, dynamic coloring system for multi-strategy comparison.

---

## 🌎 Data & Macro-Economics

### Asset Universe
| Asset | Ticker Proxy | Role |
|:------|:-------------|:-----|
| **S&P 500** | SPY | 1x Core Equity |
| **SSO (2x)** | *Simulated* | 2x Daily Leveraged Equity |
| **SPYU (4x)** | *Simulated* | 4x Daily Leveraged Equity |
| **Treasuries** | VFISX | Cash-equivalent safe haven |
| **Commodities** | PCRIX | Inflation-hedging component |
| **CPI** | FRED: CPIAUCSL | Macro inflation context |

### Inflation Logic (Real Returns)
We fetch historical CPI-U data from the St. Louis Fed. Since CPI is reported monthly, the engine **interpolates daily multipliers** based on linear growth between reports. This allows us to calculate:
`Real Growth = Nominal Growth / (CPI_current / CPI_start)`
This chart is essential for identifying if a strategy is truly building wealth or simply keeping pace with devaluing currency.

---

## 🧪 Interactive Strategy Laboratory

The **Strategy Laboratory** allows users to break away from precomputed models and test their own quantitative theories in real-time.

### 1. Dynamic Allocation Matrix
Configure a custom portfolio for 5 distinct market regimes:
- **Tier 0 (Safe)**: Minimal drawdown (usually 0 to -5%).
- **Tiers 1-3**: Intermediate "buy the dip" zones.
- **Tier 4 (Crash)**: Major market discounts (typically > -20% or -30%).

### 2. Logic Engines
- **Daily Rebalance**: High responsiveness to market moves.
- **Ratchet Logic**: A path-dependent engine that "locks in" high leverage until a new All-Time High is reached.
- **Trend Filter**: 200-day SMA override that forces de-leveraging during structural bear markets.

---

## 📐 Asset Allocation Tiers (Precomputed)

Each strategy dynamically shifts its internal weight matrix based on the **previous day's drawdown**. To prevent look-ahead bias, all signals are lagged by 1 business day.

### The Standard "Ladder" (0.2x to 3.2x)
This is our primary Safeties benchmark. It scales internal equity leverage from 1x (T0) to 4x (T4) but reduces the final leverage by 0.8x to allocate into a 50/50 Bond/Commodity buffer.

| Tier | Drawdown Range | VOO (1x) | SSO (2x) | SPYU (4x) | DJP | BILL | Eff. Leverage |
|:-----|:---------------|:---------|:---------|:----------|:----|:-----|:--------------|
| **Safe (T0)** | 0% to −5% | 20% | 0% | 0% | 40% | 40% | **0.2x** |
| **T1** | −5% to −10% | 70% | 0% | 0% | 15% | 15% | **0.7x** |
| **T2** | −10% to −20% | 40% | 40% | 0% | 10% | 10% | **1.2x** |
| **T3** | −20% to −30% | 0% | 50% | 30% | 10% | 10% | **2.2x** |
| **T4** | > −30% | 0% | 0% | 80% | 10% | 10% | **3.2x** |

### The Pure "Ladder" (1.0x to 4.0x)
Maintains 100% equity exposure at all times.

| Tier | Drawdown Range | VOO (1x) | SSO (2x) | SPYU (4x) | Eff. Leverage |
|:-----|:---------------|:---------|:---------|:----------|:--------------|
| **Safe (T0)** | 0% to −5% | 100% | 0% | 0% | **1.0x** |
| **T1** | −5% to −10% | 50% | 50% | 0% | **1.5x** |
| **T2** | −10% to −20% | 0% | 100% | 0% | **2.0x** |
| **T3** | −20% to −30% | 0% | 50% | 50% | **3.0x** |
| **T4** | > −30% | 0% | 0% | 100% | **4.0x** |

---

## 🏆 The "Honest" Hall of Fame

The **Special** variants are the result of a 100,000-iteration global Monte Carlo optimization using strictly lagged data.

- **Special BEAST**: The maximum growth engine. Achieves **~20% CAGR** by maintaining high leverage even in bull markets (T0), using Commodities as its primary risk dampener.
- **Special SCALPEL**: The efficiency king. Optimized for **Sharpe Ratio (0.91)**. It stays in 90% Cash (BILL) during low-volatility regimes and only deploys capital during deep discounts. Max Drawdown: **-16.9%**.
- **Special SHIELD**: The hybrid champion. Uses **Ratchet Logic** to lock in recovery tiers effectively matching 2x benchmark returns but with half the drawdown.

---

## 🚀 Technical Implementation & Methodology

- **Honest Simulation**: Unlike many backtests that "peek" at daily closing prices, this engine uses `shift(1)` for all signals. Trades are executed at *today's* price based solely on *yesterday's* state.
- **Python (Backend)**: Uses `pandas` to precompute 17+ core variants.
- **JavaScript (Frontend)**: ES6 simulation engine for the Strategy Laboratory.
- **Data Refresh**: Github Actions triggers a daily fetch via Yahoo Finance and FRED.

---

## 🛠️ Local Development

```bash
# 1. Clone & Install
git clone https://github.com/tenkdotolami/Strategy-Tournament.git
pip install pandas yfinance numpy

# 2. Precompute Data
python precompute.py

# 3. View Dashboard (Local Server required for fetch)
python -m http.server 8000
# Open http://localhost:8000
```

---

## ⚖️ License
MIT
