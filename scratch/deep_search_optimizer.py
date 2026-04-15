import yfinance as yf
import pandas as pd
import numpy as np
import time
import random
import multiprocessing
import os
from concurrent.futures import ProcessPoolExecutor, as_completed

# === Configuration ===
TICKERS = {'VOO': 'IVV', 'BILL': 'VFISX', 'DJP': 'PCRIX'}
SIM_START = '2002-07-01'
PRIME_START = '2000-01-01'
BOUNDARY_POOL = [0.03, 0.05, 0.08, 0.10, 0.12, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50]

def get_base_data():
    print("Downloading high-resolution market data...")
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
    
    ret_matrix = rets.loc[SIM_START:, ['VOO', 'SSO', 'SPYU', 'DJP', 'BILL']].values
    return ret_matrix, y_dd, y_price, y_sma

def generate_random_weights():
    weights = np.zeros(5)
    remaining = 20
    for i in range(4):
        val = random.randint(0, remaining)
        weights[i] = val
        remaining -= val
    weights[4] = remaining
    return weights / 20.0

def simulation_worker(task_id, n_iter, data):
    ret_matrix, y_dd, y_price, y_sma = data
    n_days = len(ret_matrix)
    years = n_days / 252.0
    SPY_CAGR = 0.1065

    local_best_beast = {"val": -1, "cfg": None}
    local_best_scalpel = {"val": 1.0, "cfg": None}
    local_best_shield = {"val": -1, "cfg": None}

    # Reporting frequency
    report_step = max(1, n_iter // 10)
    
    for i in range(n_iter):
        logic = random.choice(["Daily", "Ratchet"])
        bounds = sorted(random.sample(BOUNDARY_POOL, 4))
        w_matrix = np.array([generate_random_weights() for _ in range(5)])
        
        if logic == "Ratchet":
            tiers = []
            curr_max = 0
            for k in range(len(y_dd)):
                dd_val = y_dd.iloc[k]
                t = 0
                for idx, b in enumerate(bounds):
                    if dd_val <= -b: t = idx + 1
                if dd_val >= 0: curr_max = 0
                elif t > curr_max: curr_max = t
                final_t = curr_max
                if y_price.iloc[k] < y_sma.iloc[k]: final_t = 0
                tiers.append(final_t)
            tiers = np.array(tiers)
        else:
            tiers = np.zeros(len(y_dd), dtype=int)
            for idx, b in enumerate(bounds):
                tiers[y_dd <= -b] = idx + 1
            tiers[y_price < y_sma] = 0
            
        day_rets = np.sum(w_matrix[tiers] * ret_matrix, axis=1)
        cum = np.exp(np.log1p(day_rets).cumsum())
        cagr = cum[-1]**(1/years) - 1
        ath = np.maximum.accumulate(cum)
        mdd = np.min((cum - ath) / ath)
        vol = np.std(day_rets) * np.sqrt(252)
        sharpe = (cagr - 0.02) / vol if vol > 0.001 else 0
        
        cfg = {"logic": logic, "bounds": bounds, "weights": w_matrix.copy(), "cagr": cagr, "mdd": mdd, "sharpe": sharpe}

        if cagr > local_best_beast['val']:
            local_best_beast = {"val": cagr, "cfg": cfg}
        if cagr > SPY_CAGR and mdd < 0:
            if abs(mdd) < abs(local_best_scalpel['val']):
                local_best_scalpel = {"val": mdd, "cfg": cfg}
        if cagr > 0.14 and sharpe > local_best_shield['val']:
            local_best_shield = {"val": sharpe, "cfg": cfg}

    return local_best_beast, local_best_scalpel, local_best_shield

def run_multicore_search(total_iter=500000):
    data = get_base_data()
    num_workers = os.cpu_count() or 4
    batch_size = 1000  # Smaller batches = smoother progress bar
    num_tasks = total_iter // batch_size
    
    print(f"Initializing Parallel Optimizer: {num_workers} cores detection.")
    print(f"Total Iterations: {total_iter:,} in {num_tasks} batches of {batch_size:,}")
    
    best_beast = {"val": -1, "cfg": None}
    best_scalpel = {"val": 1.0, "cfg": None}
    best_shield = {"val": -1, "cfg": None}

    start_time = time.time()
    
    with ProcessPoolExecutor(max_workers=num_workers) as executor:
        futures = {executor.submit(simulation_worker, i, batch_size, data): i for i in range(num_tasks)}
        
        completed = 0
        for future in as_completed(futures):
            b_beast, b_scalpel, b_shield = future.result()
            
            # Merge Results
            if b_beast['val'] > best_beast['val']:
                best_beast = b_beast
            if b_scalpel['cfg'] and abs(b_scalpel['val']) < abs(best_scalpel['val']):
                best_scalpel = b_scalpel
            if b_shield['val'] > best_shield['val']:
                best_shield = b_shield
                
            completed += 1
            if completed % 10 == 0 or completed == num_tasks:
                percent = (completed / num_tasks) * 100
                print(f"\rProgress: [{('=' * int(percent // 5)).ljust(20)}] {percent:.1f}% Complete", end="", flush=True)

    end_time = time.time()
    print(f"\n\nOptimization Complete in {end_time - start_time:.1f} seconds.")

    def print_strat(label, data):
        if data['cfg'] is None: return
        c = data['cfg']
        print(f"\n[ {label} ]")
        print(f"Logic: {c['logic']}, Bounds: {c['bounds']}")
        print(f"CAGR: {c['cagr']:.2%}, DD: {c['mdd']:.2%}, Sharpe: {c['sharpe']:.2f}")
        for t in range(5):
            w = c['weights'][t]
            print(f"T{t}: {w[0]:.2f},{w[1]:.2f},{w[2]:.2f},{w[3]:.2f},{w[4]:.2f}")

    print_strat("THE DEEP BEAST", best_beast)
    print_strat("THE DEEP SCALPEL", best_scalpel)
    print_strat("THE DEEP SHIELD", best_shield)

if __name__ == "__main__":
    # Windows fix for multiprocessing
    multiprocessing.freeze_support()
    run_multicore_search(total_iter=500000)
