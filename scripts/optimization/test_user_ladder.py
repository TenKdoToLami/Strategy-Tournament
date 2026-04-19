import yfinance as yf
import pandas as pd
import numpy as np
import time

# === Configuration ===
TICKERS = {'VOO': 'SPY', 'BILL': 'VFISX', 'DJP': 'PCRIX'}
SIM_START = '2002-07-01'
PRIME_START = '2000-01-01'
BOUNDS = [0.05, 0.10, 0.20, 0.30]

def get_data():
    series = {}
    for name, ticker in TICKERS.items():
        df = yf.download(ticker, start=PRIME_START, auto_adjust=True, progress=False)
        series[name] = df['Close'].squeeze() if 'Close' in df.columns else df.iloc[:, 0].squeeze()
    
    df = pd.DataFrame(series).ffill().dropna()
    rets = df.pct_change().fillna(0)
    
    r_spy = rets['VOO']
    r_bill = rets['BILL']
    rets['SSO'] = r_spy * 2.0 - (r_bill * 1.0)
    rets['SPYU'] = r_spy * 4.0 - (r_bill * 3.0)
    
    prices = df['VOO']
    ath = prices.expanding().max()
    dd = (prices - ath) / ath
    
    y_dd = dd.shift(1).fillna(0).loc[SIM_START:]
    y_price = prices.shift(1).loc[SIM_START:]
    y_sma = prices.rolling(200).mean().shift(1).loc[SIM_START:]
    
    return rets.loc[SIM_START:], y_dd, y_price, y_sma

def simulate(weights, returns, y_dd, y_price, y_sma, logic='Daily'):
    if logic == 'Ratchet':
        tiers_list = []
        curr_max = 0
        for i in range(len(y_dd)):
            dd_val = y_dd.iloc[i]
            t = 0
            for j, b in enumerate(BOUNDS):
                if dd_val <= -b: t = j + 1
            if dd_val >= 0: curr_max = 0
            elif t > curr_max: curr_max = t
            final_t = curr_max
            if y_price.iloc[i] < y_sma.iloc[i]: final_t = 0
            tiers_list.append(final_t)
        tiers = np.array(tiers_list)
    else: # Daily
        tiers = np.zeros(len(y_dd), dtype=int)
        for i, b in enumerate(BOUNDS):
            tiers[y_dd <= -b] = i + 1
        tiers[y_price < y_sma] = 0

    daily_weights = np.array([weights[t] for t in tiers])
    asset_rets = returns[['VOO', 'SSO', 'SPYU', 'DJP', 'BILL']].values
    port_rets = np.sum(daily_weights * asset_rets, axis=1)
    
    cum = np.exp(np.log1p(port_rets).cumsum())
    years = len(returns) / 252.0
    cagr = cum[-1]**(1/years) - 1
    ath = np.maximum.accumulate(cum)
    mdd = np.min((cum - ath) / ath)
    vol = np.std(port_rets) * np.sqrt(252)
    sharpe = (cagr - 0.02) / vol if vol > 0 else 0
    
    return cagr, mdd, sharpe

# 1x to 4x Ladder weights
pure_weights = [
    [1.0, 0.0, 0.0, 0.0, 0.0], # T0: 1x (VOO)
    [0.5, 0.5, 0.0, 0.0, 0.0], # T1: 1.5x (50 VOO, 50 SSO)
    [0.0, 1.0, 0.0, 0.0, 0.0], # T2: 2.0x (100 SSO)
    [0.0, 0.5, 0.5, 0.0, 0.0], # T3: 3.0x (50 SSO, 50 SPYU)
    [0.0, 0.0, 1.0, 0.0, 0.0]  # T4: 4.0x (100 SPYU)
]

# Safeties Ladder (L - 0.8)
safeties_weights = [
    [0.2, 0.0, 0.0, 0.4, 0.4], # T0: 0.2x (20 VOO + 80 S)
    [0.7, 0.0, 0.0, 0.15,0.15],# T1: 0.7x (70 VOO + 30 S)
    [0.4, 0.4, 0.0, 0.1, 0.1], # T2: 1.2x (80% weight at 1.5x int = 40/40)
    [0.0, 0.5, 0.3, 0.1, 0.1], # T3: 2.2x (80% weight at 2.75x int = 50SSO/30SPYU)
    [0.0, 0.0, 0.8, 0.1, 0.1]  # T4: 3.2x (80% weight into 4x)
]

# Standard Daily Safeties (Current Baseline)
std_weights = [
    [0.8, 0.0, 0.0, 0.1, 0.1], 
    [0.6, 0.2, 0.0, 0.1, 0.1],
    [0.3, 0.25, 0.25, 0.1, 0.1],
    [0.1, 0.35, 0.35, 0.1, 0.1],
    [0.0, 0.5, 0.5, 0.0, 0.0]
]

def run():
    rets, y_dd, y_price, y_sma = get_data()
    print("Market Data Loaded. Starting Simulations...")
    
    comparisons = [
        ("Benchmark SPY (1x)", [[1,0,0,0,0]]*5, 'Daily'),
        ("Standard Daily Safeties", std_weights, 'Daily'),
        ("Proposed Ladder PURE (Daily)", pure_weights, 'Daily'),
        ("Proposed Ladder SAFETIES (Daily)", safeties_weights, 'Daily'),
        ("Proposed Ladder PURE (Ratchet)", pure_weights, 'Ratchet'),
        ("Proposed Ladder SAFETIES (Ratchet)", safeties_weights, 'Ratchet'),
    ]

    print("\nPERFORMANCE RESULTS (2002-2026)")
    print(f"{'Strategy':<35} | {'CAGR':<7} | {'MaxDD':<7} | {'Sharpe':<6}")
    print("-" * 65)

    for name, w, logic in comparisons:
        c, m, s = simulate(w, rets, y_dd, y_price, y_sma, logic)
        print(f"{name:<35} | {c:7.2%} | {m:7.2%} | {s:6.2f}")

if __name__ == "__main__":
    run()
