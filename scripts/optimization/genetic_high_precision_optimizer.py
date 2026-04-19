import yfinance as yf
import pandas as pd
import numpy as np
import time
import random
import multiprocessing
import os
from concurrent.futures import ProcessPoolExecutor, as_completed

# === Configuration ===
TICKERS = {'VOO': 'SPY', 'BILL': 'VFISX', 'DJP': 'PCRIX'}
SIM_START = '2002-07-01'
PRIME_START = '2000-01-01'

def get_base_data():
    print("Fetching market data...")
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
    return ret_matrix, y_dd.values, y_price.values, y_sma.values

def generate_random_weights():
    """Generates 5 integer weights that sum to 100."""
    weights = np.zeros(5, dtype=int)
    remaining = 100
    for i in range(4):
        val = random.randint(0, remaining)
        weights[i] = val
        remaining -= val
    weights[4] = remaining
    random.shuffle(weights)
    return weights

def mutate_weights(weights, magnitude=5):
    """Nudges integer weights while keeping the sum at 100."""
    new_weights = weights.copy()
    idx1, idx2 = random.sample(range(5), 2)
    change = random.randint(1, magnitude)
    if new_weights[idx1] >= change:
        new_weights[idx1] -= change
        new_weights[idx2] += change
    return new_weights

def simulation_core(ret_matrix, y_dd, y_price, y_sma, logic, bounds, w_matrix):
    """Vectorized simulation core."""
    n_days = len(ret_matrix)
    
    if logic == "Ratchet":
        tiers = np.zeros(n_days, dtype=int)
        curr_max = 0
        for k in range(n_days):
            dd_val = y_dd[k]
            t = 0
            for idx, b in enumerate(bounds):
                if dd_val <= -b/100.0: t = idx + 1
            
            if dd_val >= 0: curr_max = 0
            elif t > curr_max: curr_max = t
            
            final_t = curr_max
            if y_price[k] < y_sma[k]: final_t = 0
            tiers[k] = final_t
    else:
        tiers = np.zeros(n_days, dtype=int)
        for idx, b in enumerate(bounds):
            tiers[y_dd <= -b/100.0] = idx + 1
        tiers[y_price < y_sma] = 0
        
    w_norm = w_matrix / 100.0
    day_rets = np.sum(w_norm[tiers] * ret_matrix, axis=1)
    
    # Fast CAGR
    cum = np.exp(np.log1p(day_rets).cumsum())
    final_val = cum[-1]
    years = n_days / 252.0
    cagr = final_val**(1.0/years) - 1.0
    
    # MDD
    ath = np.maximum.accumulate(cum)
    dd_series = (cum - ath) / ath
    mdd = np.min(dd_series)
    
    # Volatility & Sharpe
    vol = np.std(day_rets) * np.sqrt(252)
    sharpe = (cagr - 0.02) / vol if vol > 0.001 else 0
    
    return cagr, mdd, vol, sharpe

class Individual:
    def __init__(self, logic=None, bounds=None, weights=None):
        self.logic = logic or random.choice(["Daily", "Ratchet"])
        if bounds is None:
            self.bounds = sorted(random.sample(range(1, 60), 4))
        else:
            self.bounds = sorted(bounds)
        self.weights = weights if weights is not None else np.array([generate_random_weights() for _ in range(5)])
        
        self.cagr = 0
        self.mdd = 0
        self.vol = 0
        self.sharpe = 0
        self.fitness = 0

def crossover(p1, p2):
    # Swap Logic
    child_logic = random.choice([p1.logic, p2.logic])
    
    # Blend Bounds
    child_bounds = []
    for b1, b2 in zip(p1.bounds, p2.bounds):
        child_bounds.append(random.choice([b1, b2]))
    child_bounds = sorted(list(set(child_bounds)))
    while len(child_bounds) < 4:
        child_bounds.append(random.randint(1, 60))
        child_bounds = sorted(list(set(child_bounds)))
    
    # Mix Weights
    child_weights = []
    for w1, w2 in zip(p1.weights, p2.weights):
        child_weights.append(random.choice([w1, w2]).copy())
    
    return Individual(child_logic, child_bounds, np.array(child_weights))

def mutate(ind):
    # Mutate Logic
    if random.random() < 0.1:
        ind.logic = "Ratchet" if ind.logic == "Daily" else "Daily"
    
    # Mutate Bounds
    if random.random() < 0.3:
        idx = random.randint(0, 3)
        ind.bounds[idx] = max(1, min(60, ind.bounds[idx] + random.choice([-1, 1])))
        ind.bounds = sorted(list(set(ind.bounds)))
        while len(ind.bounds) < 4:
            ind.bounds.append(random.randint(1, 60))
            ind.bounds = sorted(list(set(ind.bounds)))
            
    # Mutate Weights
    if random.random() < 0.5:
        tier = random.randint(0, 4)
        ind.weights[tier] = mutate_weights(ind.weights[tier])

def evolve_batch(data, population, target_type, generations=5):
    ret_matrix, y_dd, y_price, y_sma = data
    SPY_CAGR = 0.1065
    
    for gen in range(generations):
        # 1. Evaluate
        for ind in population:
            c, m, v, s = simulation_core(ret_matrix, y_dd, y_price, y_sma, ind.logic, ind.bounds, ind.weights)
            ind.cagr, ind.mdd, ind.vol, ind.sharpe = c, m, v, s
            
            # Fitness logic
            if target_type == "BEAST":
                ind.fitness = ind.cagr
            elif target_type == "SCALPEL":
                # Minimize Volatility if beating SPY
                ind.fitness = (1.0 / (ind.vol + 0.001)) if ind.cagr > SPY_CAGR else (ind.cagr - 1.0)
            elif target_type == "SHIELD":
                # Minimize Max Drawdown
                ind.fitness = (1.0 / (abs(ind.mdd) + 0.001)) if ind.cagr > 0.08 else (ind.cagr - 1.0)

        # 2. Selection
        population.sort(key=lambda x: x.fitness, reverse=True)
        elites = population[:20]
        
        # 3. Breeding
        new_pop = elites.copy()
        while len(new_pop) < len(population):
            p1, p2 = random.sample(elites, 2)
            child = crossover(p1, p2)
            mutate(child)
            new_pop.append(child)
        population = new_pop
        
    return population

def run_optimizer():
    data = get_base_data()
    POP_SIZE = 200
    GENS = 50
    THREADS = os.cpu_count() or 4
    
    print(f"Starting High-Precision Genetic Search ({THREADS} threads)...")
    
    # Independent populations for each target
    targets = ["BEAST", "SCALPEL", "SHIELD"]
    final_best = {t: None for t in targets}
    
    with ProcessPoolExecutor(max_workers=THREADS) as executor:
        futures = []
        for t in targets:
            # Create several sub-populations per target to increase diversity
            for _ in range(THREADS):
                pop = [Individual() for _ in range(POP_SIZE // THREADS)]
                futures.append(executor.submit(evolve_batch, data, pop, t, GENS))
        
        all_results = {t: [] for t in targets}
        completed = 0
        for future in as_completed(futures):
            # We don't easily know which target this future was for unless we map it
            # But we can just check the results
            res_pop = future.result()
            # Try to identify target by looking at fitness samples (or just pass it back)
            # Simplest: just store which future belongs to which target
            pass
        
        # Re-evaluating the logic to track targets properly
        executor.shutdown(wait=False) # Cancel and restart for cleaner mapping

    # Correct Multi-threaded approach with tracking
    print("Initializing populations...")
    with ProcessPoolExecutor(max_workers=THREADS) as executor:
        task_map = {}
        for t in targets:
            for i in range(THREADS):
                pop = [Individual() for _ in range(POP_SIZE)]
                f = executor.submit(evolve_batch, data, pop, t, GENS)
                task_map[f] = t
        
        target_pops = {t: [] for t in targets}
        for f in as_completed(task_map):
            t = task_map[f]
            target_pops[t].extend(f.result())
            print(f"  Finished sub-population for {t}")

    print("\n--- OPTIMIZATION COMPLETE ---\n")
    
    for t in targets:
        pop = target_pops[t]
        pop.sort(key=lambda x: x.fitness, reverse=True)
        best = pop[0]
        
        print(f"[{t} RESULT]")
        print(f"Logic: {best.logic}, Bounds: {best.bounds}")
        print(f"CAGR: {best.cagr:.2%}, MaxDD: {best.mdd:.2%}, Vol: {best.vol:.2%}, Sharpe: {best.sharpe:.2f}")
        for i, row in enumerate(best.weights):
            print(f"  T{i}: VOO={row[0]}%, SSO={row[1]}%, SPYU={row[2]}%, DJP={row[3]}%, BILL={row[4]}%")
        print("-" * 30)

if __name__ == "__main__":
    multiprocessing.freeze_support()
    run_optimizer()
