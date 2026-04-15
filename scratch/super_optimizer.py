import yfinance as yf
import pandas as pd
import numpy as np
import time
import random
import itertools

# === Configuration ===
TICKERS = {'VOO': 'SPY', 'BILL': 'VFISX', 'DJP': 'PCRIX'}
SIM_START = '2002-07-01'
PRIME_START = '2000-01-01'
BOUNDS = [0.05, 0.10, 0.20, 0.30]

def get_base_data():
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
    
    tiers_daily = np.zeros(len(y_dd), dtype=int)
    for i, b in enumerate(BOUNDS):
        tiers_daily[y_dd <= -b] = i + 1
    tiers_daily[y_price < y_sma] = 0
    
    tiers_ratchet = []
    curr_max = 0
    for i in range(len(y_dd)):
        dd_val = y_dd.iloc[i]
        price_val = y_price.iloc[i]
        sma_val = y_sma.iloc[i]
        tier = 0
        for j, b in enumerate(BOUNDS):
            if dd_val <= -b: tier = j + 1
        if dd_val >= 0: curr_max = 0
        elif tier > curr_max: curr_max = tier
        final_tier = curr_max
        if price_val < sma_val: final_tier = 0
        tiers_ratchet.append(final_tier)
    
    tiers_ratchet = np.array(tiers_ratchet)
    ret_matrix = rets.loc[SIM_START:, ['VOO', 'SSO', 'SPYU', 'DJP', 'BILL']].values
    return ret_matrix, tiers_daily, tiers_ratchet

def generate_valid_weights():
    combos = []
    for weights in itertools.product(range(11), repeat=5):
        if sum(weights) == 10:
            combos.append([w/10.0 for w in weights])
    return np.array(combos)

def run_monte_carlo(n_iter=50000):
    ret_matrix, tiers_daily, tiers_ratchet = get_base_data()
    all_combos = generate_valid_weights()
    n_combos = len(all_combos)
    n_days = len(ret_matrix)
    years = n_days / 252.0
    
    best_cagr = {"logic": None, "val": -1, "weights": None}
    best_sharpe = {"logic": None, "val": -1, "weights": None}
    best_shield = {"logic": None, "val": -1, "weights": None, "dd": 0, "cagr": 0}

    print(f"Running {n_iter} iterations...")
    for i in range(n_iter):
        cfg = [random.randint(0, n_combos-1) for _ in range(5)]
        weights = all_combos[cfg]
        
        for name, tiers in [("Daily", tiers_daily), ("Ratchet", tiers_ratchet)]:
            day_rets = np.sum(weights[tiers] * ret_matrix, axis=1)
            # Fast Compounding
            cum = np.exp(np.log1p(day_rets).cumsum())
            cagr = cum[-1]**(1/years) - 1
            ath = np.maximum.accumulate(cum)
            mdd = np.min((cum - ath) / ath)
            vol = np.std(day_rets) * np.sqrt(252)
            sharpe = (cagr - 0.02) / vol if vol > 0.001 else 0
            
            if cagr > best_cagr['val']:
                best_cagr = {'logic': name, 'val': cagr, 'mdd': mdd, 'sharpe': sharpe, 'weights': weights.copy()}
            
            if sharpe > best_sharpe['val']:
                best_sharpe = {'logic': name, 'val': sharpe, 'cagr': cagr, 'mdd': mdd, 'weights': weights.copy()}
            
            # The Shield: Best CAGR with DD > -40% (Realistic for leveraged)
            if mdd > -0.38 and cagr > best_shield['val']:
                best_shield = {'logic': name, 'val': cagr, 'mdd': mdd, 'sharpe': sharpe, 'weights': weights.copy()}

    print("\n[ HONEST BEAST ]")
    print(f"Logic: {best_cagr['logic']}, CAGR: {best_cagr['val']:.2%}, DD: {best_cagr['mdd']:.2%}")
    print_w(best_cagr['weights'])

    print("\n[ HONEST SCALPEL ]")
    print(f"Logic: {best_sharpe['logic']}, Sharpe: {best_sharpe['val']:.2f}, CAGR: {best_sharpe['cagr']:.2%}, DD: {best_sharpe['mdd']:.2%}")
    print_w(best_sharpe['weights'])

    print("\n[ HONEST SHIELD ]")
    print(f"Logic: {best_shield['logic']}, CAGR: {best_shield['val']:.2%}, DD: {best_shield['mdd']:.2%}")
    print_w(best_shield['weights'])

def print_w(w):
    for t in range(5):
        print(f"T{t}: {w[t,0]:.1f},{w[t,1]:.1f},{w[t,2]:.1f},{w[t,3]:.1f},{w[t,4]:.1f}")

if __name__ == "__main__":
    run_monte_carlo(n_iter=100000)
