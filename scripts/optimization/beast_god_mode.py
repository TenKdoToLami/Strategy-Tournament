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
SIM_START = '2002-07-01'
PRIME_START = '2000-01-01'

def get_base_data():
    print("Fetching market data...")
    series = {}
    for name, ticker in TICKERS.items():
        df = yf.download(ticker, start=PRIME_START, auto_adjust=True, progress=False)
        series[name] = df[('Close', ticker)].squeeze() if isinstance(df.columns, pd.MultiIndex) else df['Close'].squeeze()
    
    df = pd.DataFrame(series).ffill().dropna()
    rets = df.pct_change().fillna(0)
    
    r_voo = rets['VOO']
    r_bill = rets['BILL']
    rets['SSO'] = r_voo * 2.0 - (r_bill * 1.0)
    rets['VOO4'] = r_voo * 4.0 - (r_bill * 3.0)
    
    ret_matrix = rets.loc[SIM_START:, ['VOO', 'SSO', 'VOO4', 'DJP', 'BILL']].values
    raw_prices = df['VOO'].values
    sim_indices = np.where(df.index >= pd.to_datetime(SIM_START))[0]
    n_days = len(ret_matrix)

    # Correct Drawdown Calculation: DD(day i) based on ATH up to day i
    prices_slice = raw_prices[:sim_indices[-1]+1]
    ath_series = np.maximum.accumulate(prices_slice)
    dd_series = (prices_slice - ath_series) / ath_series
    y_dd = dd_series[sim_indices - 1]
    y_price = raw_prices[sim_indices - 1]

    # --- THE GOD CACHE ---
    # Precompute all Bear Signals for SMA/EMA 20-400
    print("Building The God Cache (Precomputing 760 trend signals)...")
    sma_cache = np.zeros((401, n_days), dtype=bool)
    ema_cache = np.zeros((401, n_days), dtype=bool)
    
    for p in range(20, 401):
        # SMA
        s_vals = pd.Series(raw_prices).rolling(p).mean().values
        sma_cache[p] = (y_price < s_vals[sim_indices - 1])
        # EMA
        e_vals = pd.Series(raw_prices).ewm(span=p, adjust=False).mean().values
        ema_cache[p] = (y_price < e_vals[sim_indices - 1])
    
    return ret_matrix, y_dd, sma_cache, ema_cache

def simulation_core(ret_matrix, y_dd, sma_cache, ema_cache, sma_p, ema_p, use_sma, use_ema, target_tier, logic, bounds, w_matrix):
    n_days = len(ret_matrix)
    
    # Instant Bear Signal Look-up
    is_bear = np.zeros(n_days, dtype=bool)
    if use_sma and sma_p >= 20: is_bear |= sma_cache[sma_p]
    if use_ema and ema_p >= 20: is_bear |= ema_cache[ema_p]

    # Tier mapping (NumPy Vectorized)
    tiers_base = np.zeros(n_days, dtype=int)
    for idx, b in enumerate(bounds):
        tiers_base[y_dd <= -b/100.0] = idx + 1
        
    if logic == "Ratchet":
        tiers = np.zeros(n_days, dtype=int)
        curr_max = 0
        for k in range(n_days):
            if y_dd[k] >= 0: curr_max = 0
            elif tiers_base[k] > curr_max: curr_max = tiers_base[k]
            tiers[k] = curr_max if not is_bear[k] else target_tier
    else:
        tiers = tiers_base.copy()
        tiers[is_bear] = target_tier
        
    # Weight Application (Vectorized Sum)
    w_norm = w_matrix / 100.0
    day_rets = np.sum(w_norm[tiers] * ret_matrix, axis=1)
    
    # Metric Calculation
    # final_val = exp(sum(log1p(rets))) is fastest/stable way to get CAGR multiplier
    multiplier = np.exp(np.sum(np.log1p(day_rets)))
    
    # We only care about CAGR for God Mode
    return multiplier

class Individual:
    def __init__(self, dna=None):
        if dna:
            self.__dict__.update(dna)
            self.bounds = sorted(self.bounds)
            self.weights = np.array(self.weights)
        else:
            self.logic = random.choice(["Daily", "Ratchet"])
            self.bounds = sorted(random.sample(range(1, 80), 4))
            self.weights = np.array([self.gen_weights() for _ in range(5)])
            self.sma = random.randint(0, 400) # 0 means off
            self.ema = random.randint(0, 400)
            self.use_sma = (self.sma >= 20)
            self.use_ema = (self.ema >= 20)
            self.target_tier = random.randint(0, 4)
            if not self.use_sma and not self.use_ema:
                self.sma = 224 # Guarantee at least one starting signal
                self.use_sma = True
            
        self.fitness = 0.0
        self.multiplier = 0.0

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

    def to_dna(self):
        d = self.__dict__.copy()
        d['weights'] = self.weights.tolist()
        return d

def crossover(p1, p2):
    dna = {
        'logic': random.choice([p1.logic, p2.logic]),
        'bounds': sorted([random.choice([b1, b2]) for b1, b2 in zip(p1.bounds, p2.bounds)]),
        'weights': [random.choice([w1, w2]).tolist() for w1, w2 in zip(p1.weights, p2.weights)],
        'sma': random.choice([p1.sma, p2.sma]),
        'ema': random.choice([p1.ema, p2.ema]),
        'use_sma': random.choice([p1.use_sma, p2.use_sma]),
        'use_ema': random.choice([p1.use_ema, p2.use_ema]),
        'target_tier': random.choice([p1.target_tier, p2.target_tier])
    }
    return Individual(dna)

def mutate(ind):
    if random.random() < 0.1: ind.logic = "Ratchet" if ind.logic == "Daily" else "Daily"
    if random.random() < 0.3:
        idx = random.randint(0, 3)
        ind.bounds[idx] = max(1, min(85, ind.bounds[idx] + random.randint(-10, 10)))
        ind.bounds.sort()
    if random.random() < 0.4: ind.sma = max(0, min(400, ind.sma + random.randint(-30, 30))); ind.use_sma = (ind.sma >= 20)
    if random.random() < 0.4: ind.ema = max(0, min(400, ind.ema + random.randint(-30, 30))); ind.use_ema = (ind.ema >= 20)
    if random.random() < 0.2: ind.target_tier = random.randint(0, 4)
    if random.random() < 0.6:
        tier = random.randint(0, 4)
        i1, i2 = random.sample(range(5), 2)
        n = random.randint(1, 20)
        if ind.weights[tier][i1] >= n:
            ind.weights[tier][i1] -= n
            ind.weights[tier][i2] += n

def evolve_island(data, population, gens):
    ret_matrix, y_dd, sma_cache, ema_cache = data
    for g in range(gens):
        for ind in population:
            ind.multiplier = simulation_core(ret_matrix, y_dd, sma_cache, ema_cache, ind.sma, ind.ema, ind.use_sma, ind.use_ema, ind.target_tier, ind.logic, ind.bounds, ind.weights)
            ind.fitness = ind.multiplier
        
        population.sort(key=lambda x: x.fitness, reverse=True)
        # Use local population size to avoid global scope issues in multiprocessing
        pop_size = len(population)
        elites = population[:max(1, pop_size // 10)] # Top 10%
        new_pop = elites.copy()
        while len(new_pop) < pop_size:
            p1, p2 = random.sample(elites, 2)
            child = crossover(p1, p2)
            if random.random() < 0.6: mutate(child) # High mutation for God Mode
            new_pop.append(child)
        population = new_pop
    return population

def run_optimizer():
    global POP_SIZE
    data = get_base_data()
    THREADS = os.cpu_count() or 4
    POP_SIZE = 2000 #Massive population
    TOTAL_EPOCHS = 40
    SUB_GENS = 500
    
    print(f"BEAST GOD MODE: Initiating Massive Random Search ({THREADS} threads x {TOTAL_EPOCHS*SUB_GENS} gens)...")
    
    # Initialize purely random populations
    islands = [[Individual() for _ in range(POP_SIZE // THREADS)] for _ in range(THREADS)]
    best_ever = None

    try:
        for epoch in range(TOTAL_EPOCHS):
            print(f"Epoch {epoch+1}/{TOTAL_EPOCHS}...")
            
            with ProcessPoolExecutor(max_workers=THREADS) as executor:
                futures = [executor.submit(evolve_island, data, islands[i], SUB_GENS) for i in range(THREADS)]
                islands = [f.result() for f in as_completed(futures)]
            
            # Merge and Migrate
            all_ind = []
            for isl in islands: all_ind.extend(isl)
            all_ind.sort(key=lambda x: x.fitness, reverse=True)
            queen = all_ind[0]
            if best_ever is None or queen.fitness > best_ever.fitness:
                best_ever = queen
                sma_str = f"{queen.sma}" if queen.use_sma else "OFF"
                ema_str = f"{queen.ema}" if queen.use_ema else "OFF"
                print(f"  [NEW GOD PEAK] Multiplier: {queen.multiplier:,.2f}x | SMA: {sma_str} | EMA: {ema_str} | Target: T{queen.target_tier}")
                with open('beast_god_mode_best.json', 'w') as f:
                    json.dump(queen.to_dna(), f, indent=4)
            
            # Migration: Distribute the best genetic traits back to islands
            top_migrants = all_ind[:20]
            for i in range(THREADS):
                for j in range(20): islands[i][-(j+1)] = random.choice(top_migrants)
    except KeyboardInterrupt:
        print("\n[!] Optimization Aborted by User. Finalizing best results...")

    print("\n--- GOD MODE EVOLUTION COMPLETE ---")
    if best_ever:
        print(f"ULTIMATE PREDATOR FOUND: {best_ever.multiplier:,.2f}x since 2002.")

if __name__ == "__main__":
    multiprocessing.freeze_support()
    start_t = time.time()
    
    run_optimizer()
    
    end_t = time.time()
    duration = end_t - start_t
    print(f"\nEvolution Duration: {duration/60:.1f} minutes ({duration:.0f} seconds)")
