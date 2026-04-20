# 📈 Strategy Tournament: Dynamic Leverage & Quant Console

<div align="center">
  <img src="assets/images/banner.png" alt="Strategy Tournament Banner" width="100%">
  <br>
  
  [![Live Dashboard](https://img.shields.io/badge/Live-Dashboard-6E56CF?style=for-the-badge&logo=opsgenie&logoColor=white)](https://tenkdotolami.github.io/Strategy-Tournament/)
  [![Tech Stack](https://img.shields.io/badge/Stack-Python%20%7C%20JS%20%7C%20Plotly-0052FF?style=for-the-badge)](https://github.com/TenKdoToLami/Strategy-Tournament)
  [![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
</div>

---

## 🏛️ Project Vision
The core thesis of this platform is **systematic recovery scaling**: taking advantage of transitory drawdowns within the S&P 500 (SPX) to strategically rotate into leveraged instruments (2x/4x VOO). By increasing exposure during "blood in the streets" scenarios and reverting to safety during all-time highs, the engine aims to radically amplify the market's long-term upward trend.

> "Leverage was given to us by greedy addicted gamblers, and I see it as an absolute win."

---

## 🚀 Key Modules

### 1. 📊 Performance Dashboard
The "Tournament" view compares 20+ precomputed institutional strategies against S&P 500 benchmarks.
- **Advanced Metrics**: Calmar, Sortino, Jensen's Alpha, and Omega Ratios.
- **Dual Visuals**: Linear and Logarithmic growth curves.
- **Real Returns**: Inflation-adjusted performance using FRED CPI-U data.

### 2. 🧪 Quant Lab (Strategy Builder)
An interactive "Strategy Laboratory" for real-time browser-side simulation.
- **Allocation Matrix**: Define custom asset weights across 5 drawdown tiers (T0-T4).
- **Logic Selection**: Toggle between **Daily Rebalancing** and **Ratchet Logic**.
- **Regime Filters**: Configure 200-day SMA/EMA trend shields.

### 3. 🕹️ Logic Simulator
A high-fidelity visualization of the strategy state-machine.
- **Drawdown Slider**: Adjust current market conditions to see logic transitions in real-time.
- **Decision Engine**: Visualize path-dependent "Ratchet" vs "Linear" logic.

### 4. 🧭 Strategy Explorer
Side-by-side comparison tool for deep-diving into specific strategy mechanisms, trend-filter interactions, and calendar year performance.

---

## 📐 Quantitative Methodology

### The Standard Epoch (2002+)
To ensure 100% mathematical integrity, all simulations begin on **July 1st, 2002**. This aligns with the inception of the **PCRIX (Commodity Proxy)**, eliminating the statistical "interpolation error" often found in longer-duration backtests that lack commodity data.

### Synthetic Asset Synthesis
Since high-leverage (4x) ETFs are rare or suffer from extreme fees, our engine synthesizes their returns using a **Cost of Carry** model:

$$R_{lev} = (R_{und} \times L) - (R_{fin} \times (L - 1))$$

- **$R_{und}$**: VOO (1x) Daily Return.
- **$L$**: Leverage Factor (2.0x, 4.0x).
- **$R_{fin}$**: Financing Rate (Proxied by VFISX/BILL).

### The Hysteresis Engine (Ratchet Logic)
Under **Ratchet Logic**, state transitions are "sticky" during recovery. A portfolio that hits T4 (Major Crash) remains at maximum tilt until a **New All-Time High** is reached, ensuring the strategy captures the full velocity of the recovery rally.

---

## 🏆 The Strategy "Hall of Fame"
Results from a **Standard Epoch (2002+)** simulation based on the latest genetic optimization.

| Strategy | CAGR | Drawdown | Sharpe | Highlight |
|:---------|:-----|:---------|:-------|:----------|
| **Special BEAST (v2)** | **36.15%** | -86.7% | 0.88 | **1,530.4x Multiplier**. Absolute growth apex. |
| **Special SCALPEL (v2)** | **14.01%** | **-15.0%** | **1.30** | **Institutional Precision**. Beats 1x Benchmark with extreme low volatility. |
| **Benchmark VOO** | 10.73% | -55.2% | 0.63 | Standard S&P 500 Index tracking. |

### Logic Explanations

*   **Special BEAST (v2)**: Discovered via a 50-epoch deep-search. It utilizes a **362/400-day Trend Hybrid** (Adaptive SMA/EMA filter) and specialized aggression in Tier 4 recovery. It is designed to maximize terminal wealth regardless of peak volatility.
*   **Special SCALPEL (v2)**: Evolved for maximum **Risk-Adjusted Return**. It achieves a Sharpe ratio of 1.30 (more than double the benchmark) by using a **232/124-day Trend Hybrid**. It focuses on surgical precision and ultra-low volatility drag during market chop.
*   **Special PREDATOR**: The robust optimizer. Dominates the modern era (2020+) utilizing an ultra-resilient **290-day trend logic**. Designed to thrive where standard drawdown strategies fail by maintaining survivability during structural shifts.

---

## 🛠️ Local Development & Pipeline

### 1. Requirements
- Python 3.10+
- Pandas, YFinance, Scipy (see `requirements.txt`)

### 2. Setup
```bash
# Clone the repository
git clone https://github.com/TenKdoToLami/Strategy-Tournament.git

# Install dependencies
pip install -r requirements.txt

# Run the precompute pipeline (Updates data/data.json)
python scripts/precompute.py

# Launch the locally
python -m http.server 8000
```

### 3. Data Flow
1. **Fetch**: Github Actions triggers `scripts/precompute.py`.
2. **Compute**: Pandas calculates signals, synthetic assets, and precomputes "Hall of Fame" variants.
3. **Serve**: `data/data.json` is exported for the frontend JS engine.

---

## 📜 Technical Documentation
For a deeper dive into "Volatility Drag", "Regime Detection", and "Ladder Philosophy", visit the **Master Manual** located directly inside the [Live Dashboard Documentation Tab](https://tenkdotolami.github.io/Strategy-Tournament/).

---

## ⚖️ License & Disclaimer
This project is for **educational and research purposes only**. Leverage carries extreme risk of loss. 
**MIT License** | Developed by [TenKdoToLami](https://github.com/TenKdoToLami)
