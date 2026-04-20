import yfinance as yf
import pandas as pd
import numpy as np
import time
import random
import multiprocessing
import os
import json
from concurrent.futures import ProcessPoolExecutor, as_completed

# === Configuration ===
TICKERS = {'VOO': 'SPY', 'BILL': 'VFISX', 'DJP': 'PCRIX'}
SIM_START_DATES = ['2002-07-01', '2008-01-01', '2012-01-01', '2016-01-01', '2020-01-01']
PRIME_START = '2000-01-01'

def get_base_data():
    print("Fetching market data...")
    series = {}
    for name, ticker in TICKERS.items():
        df = yf.download(ticker, start=PRIME_START, auto_adjust=True, progress=False)
        if isinstance(df.columns, pd.MultiIndex):
            series[name] = df[('Close', ticker)].squeeze()
        else:
            series[name] = df['Close'].squeeze() if 'Close' in df.columns else df.iloc[:, 0].squeeze()
    
    df = pd.DataFrame(series).ffill().dropna()
    rets = df.pct_change().fillna(0)
    
    r_spy = rets['VOO']
    r_bill = rets['BILL']
    rets['SSO'] = r_spy * 2.0 - (r_bill * 1.0)
    rets['SPYU'] = r_spy * 4.0 - (r_bill * 3.0)
    
    # Pre-calculated Return Matrix: VOO(0), SSO(1), SPYU(2), DJP(3), BILL(4)
    ret_matrix = rets[['VOO', 'SSO', 'SPYU', 'DJP', 'BILL']].values
    dates = df.index
    
    prices = df['VOO']
    ath = prices.expanding().max()
    dd = (prices - ath) / ath
    y_dd = dd.shift(1).fillna(0).values
    y_price = prices.shift(1).values
    
    # Caching indices for start dates
    start_indices = []
    for d_str in SIM_START_DATES:
        idx = np.where(dates >= pd.to_datetime(d_str))[0][0]
        start_indices.append(idx)
        
    return ret_matrix, y_dd, y_price, prices.values, start_indices

def simulation_core(ret_matrix, y_dd, y_price, prices, start_indices, sma_p, ema_p, use_sma, use_ema, logic, bounds, w_matrix):
    # Vectorized Trend Signals for specific periods
    sma_sig = np.zeros(len(prices), dtype=bool)
    if use_sma and sma_p > 1:
        # Fast rolling mean using cumsum
        asum = np.cumsum(np.insert(prices, 0, 0))
        sma_vals = (asum[sma_p:] - asum[:-sma_p]) / sma_p
        # Shift 1: sma_vals[i] corresponds to end of day i. We need it for day i+1.
        # Length of sma_vals is len(prices) - sma_p + 1.
        # We align it with y_price.
        sma_sig[sma_p:] = y_price[sma_p:] < sma_vals[:-1]
        
    ema_sig = np.zeros(len(prices), dtype=bool)
    if use_ema and ema_p > 1:
        # Simple EMA approximation or full loop (vectorized ema is tricky in numpy without loop)
        # We use a simple loop for precision if not too slow, or skip EMA for speed? 
        # No, for 'Ultra' precision we need it. 
        alpha = 2 / (ema_p + 1)
        ema_vals = np.zeros(len(prices))
        ema_vals[0] = prices[0]
        for i in range(1, len(prices)):
            ema_vals[i] = prices[i] * alpha + ema_vals[i-1] * (1 - alpha)
        ema_sig[1:] = y_price[1:] < ema_vals[:-1]

    is_bear = sma_sig | ema_sig
    
    # Tier mapping
    tiers_base = np.zeros(len(prices), dtype=int)
    for idx, b in enumerate(bounds):
        tiers_base[y_dd <= -b/100.0] = idx + 1
        
    if logic == "Ratchet":
        tiers = np.zeros(len(prices), dtype=int)
        curr_max = 0
        for k in range(len(prices)):
            if y_dd[k] >= 0: curr_max = 0
            elif tiers_base[k] > curr_max: curr_max = tiers_base[k]
            tiers[k] = curr_max if not is_bear[k] else 0
    else:
        tiers = tiers_base.copy()
        tiers[is_bear] = 0
        
    w_norm = w_matrix / 100.0
    day_rets = np.sum(w_norm[tiers] * ret_matrix, axis=1)
    
    # Fitness over multiple starts
    scores = []
    for s_idx in start_indices:
        slice_rets = day_rets[s_idx:]
        mult = np.exp(np.sum(np.log1p(slice_rets)))
        scores.append(mult)
        
    # Standard: Median growth weighted with worst growth to ensure robustness
    robust_fitness = np.median(scores) * 0.7 + np.min(scores) * 0.3
    return robust_fitness, scores

class Individual:
    def __init__(self, dna=None):
        if dna:
            self.logic = dna['logic']
            self.bounds = sorted(dna['bounds'])
            self.weights = dna['weights']
            self.sma = dna['sma']
            self.ema = dna['ema']
            self.use_sma = dna['use_sma']
            self.use_ema = dna['use_ema']
        else:
            self.logic = random.choice(["Daily", "Ratchet"])
            self.bounds = sorted(random.sample(range(1, 70), 4))
            self.weights = np.array([self.gen_weights() for _ in range(5)])
            self.sma = random.randint(20, 350)
            self.ema = random.randint(20, 350)
            self.use_sma = random.random() < 0.7
            self.use_ema = random.random() < 0.3
            if not self.use_sma and not self.use_ema: self.use_sma = True
        self.fitness = 0
        self.all_scores = []

    def gen_weights(self):
        w = np.zeros(5, dtype=int)
        rem = 100
        for i in range(4):
            val = random.randint(0, rem)
            w[i] = val
            rem -= val
        w[4] = rem
        random.shuffle(w)
        return w

def crossover(p1, p2):
    dna = {
        'logic': random.choice([p1.logic, p2.logic]),
        'bounds': sorted([random.choice([b1, b2]) for b1, b2 in zip(p1.bounds, p2.bounds)]),
        'weights': np.array([random.choice([w1, w2]).copy() for w1, w2 in zip(p1.weights, p2.weights)]),
        'sma': random.choice([p1.sma, p2.sma]),
        'ema': random.choice([p1.ema, p2.ema]),
        'use_sma': random.choice([p1.use_sma, p2.use_sma]),
        'use_ema': random.choice([p1.use_ema, p2.use_ema])
    }
    return Individual(dna)

def mutate(ind):
    if random.random() < 0.05: ind.logic = "Ratchet" if ind.logic == "Daily" else "Daily"
    if random.random() < 0.2:
        idx = random.randint(0, 3)
        ind.bounds[idx] = max(1, min(75, ind.bounds[idx] + random.randint(-3, 3)))
        ind.bounds.sort()
    if random.random() < 0.2: ind.sma = max(20, min(400, ind.sma + random.randint(-10, 10)))
    if random.random() < 0.2: ind.ema = max(20, min(400, ind.ema + random.randint(-10, 10)))
    if random.random() < 0.5:
        tier = random.randint(0, 4)
        i1, i2 = random.sample(range(5), 2)
        n = random.randint(1, 5)
        if ind.weights[tier][i1] >= n:
            ind.weights[tier][i1] -= n
            ind.weights[tier][i2] += n

def evaluate_pop(data, population):
    ret_matrix, y_dd, y_price, prices, start_indices = data
    for ind in population:
        ind.fitness, ind.all_scores = simulation_core(
            ret_matrix, y_dd, y_price, prices, start_indices, 
            ind.sma, ind.ema, ind.use_sma, ind.use_ema, 
            ind.logic, ind.bounds, ind.weights
        )
    return population

def run_optimizer():
    data = get_base_data()
    POP_SIZE = 100
    GENS = 500
    THREADS = os.cpu_count() or 4
    
    print(f"PREDATOR ULTRA: Starting deep evolution with {THREADS} threads...")
    population = [Individual() for _ in range(POP_SIZE)]
    
    best_ever = None
    
    for g in range(GENS):
        # Parallel Evaluation
        chunk_size = max(1, len(population) // THREADS)
        chunks = [population[i:i + chunk_size] for i in range(0, len(population), chunk_size)]
        
        with ProcessPoolExecutor(max_workers=THREADS) as executor:
            futures = [executor.submit(evaluate_pop, data, c) for c in chunks]
            population = []
            for f in as_completed(futures):
                population.extend(f.result())
        
        population.sort(key=lambda x: x.fitness, reverse=True)
        best = population[0]
        
        if best_ever is None or best.fitness > best_ever.fitness:
            best_ever = best
            # Save periodic progress
            with open('predator_ultra_best.json', 'w') as f:
                json.dump({
                    'logic': best.logic, 'bounds': best.bounds, 'sma': best.sma, 'ema': best.ema,
                    'use_sma': best.use_sma, 'use_ema': best.use_ema, 
                    'fitness': best.fitness, 'scores': best.all_scores,
                    'weights': best.weights.tolist()
                }, f, indent=4)
        
        if g % 5 == 0:
            print(f"Gen {g}: Best Robust Fitness = {best.fitness:.2f} (Worst Start = {min(best.all_scores):.2f}x)")

        # Evolution Logic
        elites = population[:15]
        new_pop = elites.copy()
        while len(new_pop) < POP_SIZE:
            p1, p2 = random.sample(elites, 2)
            child = crossover(p1, p2)
            mutate(child)
            new_pop.append(child)
        population = new_pop

    print("\n--- EVOLUTION COMPLETE ---")
    print(f"Best Overall Predator Found!")
    print(f"Median Multiplier: {best_ever.fitness:.2f}x")
    print(f"DNA: SMA={best_ever.sma}, EMA={best_ever.ema}, Logic={best_ever.logic}")

if __name__ == "__main__":
    multiprocessing.freeze_support()
    run_optimizer()
