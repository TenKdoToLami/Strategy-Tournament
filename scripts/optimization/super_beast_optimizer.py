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

# ULTRA-PRECISION CONSTANTS (Step = 0.5%)
UNIT = 0.5
WEIGHT_TOTAL_UNITS = 200 # 200 * 0.5% = 100%
BOUND_MAX_UNITS = 198    # 198 * 0.5% = 99%

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
    dd = (prices - ath) / (ath + 1e-9)
    
    y_dd = dd.shift(1).fillna(0).loc[SIM_START:]
    y_price = prices.shift(1).loc[SIM_START:]
    y_sma = prices.rolling(200).mean().shift(1).loc[SIM_START:]
    
    ret_matrix = rets.loc[SIM_START:, ['VOO', 'SSO', 'SPYU', 'DJP', 'BILL']].values
    return ret_matrix, y_dd.values, y_price.values, y_sma.values

def generate_random_weights():
    """Generates 5 integer weights (0.5% units) that sum to 200 units (100%)."""
    weights = np.zeros(5, dtype=int)
    remaining = WEIGHT_TOTAL_UNITS
    for i in range(4):
        val = random.randint(0, remaining)
        weights[i] = val
        remaining -= val
    weights[4] = remaining
    random.shuffle(weights)
    return weights

def mutate_weights(weights, magnitude=10):
    """Nudges 0.5% units while keeping sum at 200."""
    new_weights = weights.copy()
    idx1, idx2 = random.sample(range(5), 2)
    change = random.randint(1, magnitude)
    if new_weights[idx1] >= change:
        new_weights[idx1] -= change
        new_weights[idx2] += change
    return new_weights

def simulation_core(ret_matrix, y_dd, y_price, y_sma, logic, bounds_units, w_matrix_units):
    """Vectorized simulation core with 0.5% precision."""
    n_days = len(ret_matrix)
    
    # Convert units to decimal percentages (Bound units are 0.5%)
    # e.g., unit 21 -> 21 * 0.005 = 0.105 (10.5%)
    # Shortcut: units / 200.0
    
    if logic == "Ratchet":
        tiers = np.zeros(n_days, dtype=int)
        curr_max = 0
        for k in range(n_days):
            dd_val = y_dd[k]
            t = 0
            for idx, b_units in enumerate(bounds_units):
                if dd_val <= -b_units/200.0: t = idx + 1
            
            if dd_val >= 0: curr_max = 0
            elif t > curr_max: curr_max = t
            
            final_t = curr_max
            if y_price[k] < y_sma[k]: final_t = 0
            tiers[k] = final_t
    else:
        tiers = np.zeros(n_days, dtype=int)
        for idx, b_units in enumerate(bounds_units):
            tiers[y_dd <= -b_units/200.0] = idx + 1
        tiers[y_price < y_sma] = 0
        
    # Weights units to decimals
    w_norm = w_matrix_units / 200.0
    day_rets = np.sum(w_norm[tiers] * ret_matrix, axis=1)
    
    # Fast CAGR
    cum = np.exp(np.log1p(day_rets).cumsum())
    final_val = cum[-1]
    years = n_days / 252.0
    cagr = final_val**(1.0/years) - 1.0
    
    # MDD
    ath = np.maximum.accumulate(cum)
    dd_series = (cum - ath) / (ath + 1e-9)
    mdd = np.min(dd_series)
    
    # Volatility & Sharpe
    vol = np.std(day_rets) * np.sqrt(252)
    sharpe = (cagr - 0.02) / vol if vol > 0.001 else 0
    
    return cagr, mdd, vol, sharpe

class Individual:
    def __init__(self, logic=None, bounds_units=None, weights_units=None):
        self.logic = logic or random.choice(["Daily", "Ratchet"])
        if bounds_units is None:
            self.bounds_units = sorted(random.sample(range(1, BOUND_MAX_UNITS), 4))
        else:
            self.bounds_units = sorted(bounds_units)
        self.weights_units = weights_units if weights_units is not None else np.array([generate_random_weights() for _ in range(5)])
        
        self.cagr = -1.0
        self.mdd = 0
        self.vol = 0
        self.sharpe = 0
        self.fitness = -1.0

def crossover(p1, p2):
    # Swap Logic
    child_logic = random.choice([p1.logic, p2.logic])
    
    # Blend Bounds
    child_bounds = []
    for b1, b2 in zip(p1.bounds_units, p2.bounds_units):
        child_bounds.append(random.choice([b1, b2]))
    child_bounds = sorted(list(set(child_bounds)))
    while len(child_bounds) < 4:
        child_bounds.append(random.randint(1, BOUND_MAX_UNITS))
        child_bounds = sorted(list(set(child_bounds)))
    
    # Mix Weights
    child_weights = []
    for w1, w2 in zip(p1.weights_units, p2.weights_units):
        child_weights.append(random.choice([w1, w2]).copy())
    
    return Individual(child_logic, child_bounds, np.array(child_weights))

def mutate(ind):
    # Mutate Logic
    if random.random() < 0.1:
        ind.logic = "Ratchet" if ind.logic == "Daily" else "Daily"
    
    # Mutate Bounds
    if random.random() < 0.4:
        idx = random.randint(0, 3)
        ind.bounds_units[idx] = max(1, min(BOUND_MAX_UNITS, ind.bounds_units[idx] + random.randint(-4, 4)))
        ind.bounds_units = sorted(list(set(ind.bounds_units)))
        while len(ind.bounds_units) < 4:
            ind.bounds_units.append(random.randint(1, BOUND_MAX_UNITS))
            ind.bounds_units = sorted(list(set(ind.bounds_units)))
            
    # Mutate Weights
    if random.random() < 0.6:
        tier = random.randint(0, 4)
        ind.weights_units[tier] = mutate_weights(ind.weights_units[tier], magnitude=random.randint(2, 20))

def evolve_batch(data, population, target_type, generations=200):
    ret_matrix, y_dd, y_price, y_sma = data
    
    for gen in range(generations):
        for ind in population:
            if ind.fitness == -1.0:
                c, m, v, s = simulation_core(ret_matrix, y_dd, y_price, y_sma, ind.logic, ind.bounds_units, ind.weights_units)
                ind.cagr, ind.mdd, ind.vol, ind.sharpe = c, m, v, s
                ind.fitness = ind.cagr 
            
        population.sort(key=lambda x: x.fitness, reverse=True)
        elite_count = max(5, int(len(population) * 0.05))
        elites = population[:elite_count]
        
        new_pop = elites.copy()
        while len(new_pop) < len(population):
            if random.random() < 0.8:
                p1, p2 = random.sample(elites, 2)
                child = crossover(p1, p2)
            else:
                child = Individual() 
            mutate(child)
            new_pop.append(child)
        population = new_pop
        
        if (gen + 1) % 50 == 0:
            print(f"  Generation {gen+1} complete. Current Best CAGR: {elites[0].cagr:.2%}")
        
    return population

def run_optimizer():
    data = get_base_data()
    # ULTRA SUPER BEAST CONFIG
    POP_SIZE = 1000 
    GENS = 500
    THREADS = os.cpu_count() or 4
    
    print(f"--- ULTRA SUPER BEAST HUNT (0.5% resolution, MaxDD=99%) ---")
    print(f"Running {THREADS} concurrent evolutions...")
    
    with ProcessPoolExecutor(max_workers=THREADS) as executor:
        futures = []
        for i in range(THREADS):
            pop = [Individual() for _ in range(POP_SIZE)]
            f = executor.submit(evolve_batch, data, pop, "BEAST", GENS)
            futures.append(f)
        
        all_elites = []
        for f in as_completed(futures):
            res_pop = f.result()
            all_elites.extend(res_pop[:20])
            print(f"  Thread finished.")

    print("\n--- OPTIMIZATION COMPLETE ---\n")
    
    all_elites.sort(key=lambda x: x.fitness, reverse=True)
    best = all_elites[0]
    
    # Display logic (Convert units back to decimal percentages)
    final_bounds = [b * 0.5 for b in best.bounds_units]
    
    print(f"[ULTRA SUPER BEAST RESULT]")
    print(f"Logic: {best.logic}, Bounds: {final_bounds}")
    print(f"CAGR: {best.cagr:.2%}, MaxDD: {best.mdd:.2%}, Vol: {best.vol:.2%}, Sharpe: {best.sharpe:.2f}")
    for i, row in enumerate(best.weights_units):
        w_real = row * 0.5
        print(f"  T{i}: VOO={w_real[0]}%, SSO={w_real[1]}%, SPYU={w_real[2]}%, DJP={w_real[3]}%, BILL={w_real[4]}%")
    print("-" * 30)

if __name__ == "__main__":
    multiprocessing.freeze_support()
    run_optimizer()
