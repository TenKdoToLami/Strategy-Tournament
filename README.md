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

Each strategy dynamically shifts weights based on the **previous day's drawdown**.

### Standard Variants (20% Safety Net)
| Tier | Drawdown Range | VOO (1x) | SSO (2x) | SPYU (4x) | DJP | BILL |
|:-----|:---------------|:---------|:---------|:----------|:----|:-----|
| **Safe (T0)** | 0% to −5% | 80% | 0% | 0% | 10% | 10% |
| **T1** | −5% to −10% | 60% | 20% | 0% | 10% | 10% |
| **T2** | −10% to −20% | 30% | 25% | 25% | 10% | 10% |
| **T3** | −20% to −30% | 10% | 35% | 35% | 10% | 10% |
| **T4** | > −30% | 0% | 50% | 50% | 0% | 0% |

---

## 🚀 Technical Implementation

- **Python (Backend)**: Uses `pandas` and `yfinance` to precompute 14+ strategy variants and calculate CPI multipliers.
- **JavaScript (Frontend)**: A custom ES6 engine that handles date slicing, dynamic KPI calculation, and the Strategy Lab's browser-side simulation.
- **Plotly.js**: High-fidelity interactive charts including Log scales, Drawdown waterfalls, and Step-line leverage exposure.
- **Automation**: Github Actions runs the `precompute.py` script nightly.

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
