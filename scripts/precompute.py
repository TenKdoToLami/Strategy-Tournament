import yfinance as yf
import pandas as pd
import numpy as np
import json
import time

# === Configuration ===
TICKERS = {
    'VOO': 'SPY',
    'BILL': 'VFISX',
    'DJP': 'PCRIX'
}
SIM_START = '2002-07-01'
PRIME_START = '2002-07-01'

def fetch_single(ticker, start, retries=3):
    """Download a single ticker with retries to handle yfinance lock errors on CI."""
    for attempt in range(retries):
        try:
            df = yf.download(ticker, start=start, auto_adjust=True, progress=False)
            if df is not None and not df.empty:
                if 'Close' in df.columns:
                    return df['Close'].squeeze()
                # Some yfinance versions return MultiIndex columns
                elif isinstance(df.columns, pd.MultiIndex):
                    return df[('Close', ticker)].squeeze()
                else:
                    return df.iloc[:, 0].squeeze()
        except Exception as e:
            print(f"  Attempt {attempt+1}/{retries} for {ticker} failed: {e}")
            time.sleep(2)
    print(f"  WARNING: Could not download {ticker}, using zeros as fallback.")
    return None

def get_precomputed_data():
    print("Fetching market data (one ticker at a time for CI reliability)...")
    
    series = {}
    for name, ticker in TICKERS.items():
        print(f"  Downloading {name} ({ticker})...")
        s = fetch_single(ticker, PRIME_START)
        if s is not None:
            series[ticker] = s
    
    if TICKERS['VOO'] not in series or TICKERS['BILL'] not in series:
        raise RuntimeError("FATAL: Could not download SPY or VFISX. Cannot continue.")
    
    raw_df = pd.DataFrame(series).ffill().dropna()
    
    returns_raw = raw_df.pct_change().fillna(0)
    r_spy = returns_raw[TICKERS['VOO']]
    r_bill = returns_raw[TICKERS['BILL']]
    
    # DJP/PCRIX is optional — use zeros if it failed
    if TICKERS['DJP'] in returns_raw.columns:
        r_djp = returns_raw[TICKERS['DJP']]
    else:
        print("  WARNING: DJP/PCRIX unavailable, using zero returns for commodities.")
        r_djp = pd.Series(0.0, index=r_spy.index)

    r_sso  = r_spy * 2 - r_bill * 1
    r_spyu = r_spy * 4 - r_bill * 3

    spy_cum_global = (1 + r_spy).cumprod()
    spy_ath_global = spy_cum_global.cummax()
    spy_dd_global = (spy_cum_global - spy_ath_global) / spy_ath_global
    spy_sma_200 = raw_df[TICKERS['VOO']].rolling(200).mean()

    # --- Fetch Inflation (CPI) ---
    print("  Fetching Inflation data (FRED CPIAUCSL)...")
    try:
        # Consumer Price Index for All Urban Consumers: All Items in U.S. City Average
        cpi_url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL"
        cpi_raw = pd.read_csv(cpi_url, index_col='observation_date', parse_dates=['observation_date'])
        cpi_monthly = cpi_raw['CPIAUCSL']
        # Resample and interpolate to daily dates
        cpi_daily = cpi_monthly.reindex(raw_df.index).interpolate(method='linear').ffill().bfill()
        # Daily "Multiplier" for inflation (1.0 at start of sim)
        inflation_levels = cpi_daily / cpi_daily.loc[SIM_START:].iloc[0]
    except Exception as e:
        print(f"  WARNING: Could not fetch CPI data ({e}). Falling back to 2.5% fixed.")
        # Fallback: 2.5% annualized smooth growth
        days = (raw_df.index - raw_df.index[0]).days
        inflation_levels = pd.Series(np.exp(days * np.log(1.025) / 365.25), index=raw_df.index)

    def simulate_strategy(bounds, rebalance_freq='Daily', include_safeties=True, use_trend_filter=True, is_ratchet=False, custom_weights=None):
        if custom_weights is not None:
            weights = custom_weights
        elif include_safeties:
            # Proportional Safety: 80% Equity Ladder / 20% Bonds+Comm
            weights = [
                {'VOO': 0.8, 'SSO': 0.0, 'SPYU': 0.0, 'DJP': 0.1, 'BILL': 0.1},  # T0: 0.8x (1.0 * 0.8)
                {'VOO': 0.4, 'SSO': 0.4, 'SPYU': 0.0, 'DJP': 0.1, 'BILL': 0.1},  # T1: 1.2x (1.5 * 0.8)
                {'VOO': 0.0, 'SSO': 0.8, 'SPYU': 0.0, 'DJP': 0.1, 'BILL': 0.1},  # T2: 1.6x (2.0 * 0.8)
                {'VOO': 0.0, 'SSO': 0.4, 'SPYU': 0.4, 'DJP': 0.1, 'BILL': 0.1},  # T3: 2.4x (3.0 * 0.8)
                {'VOO': 0.0, 'SSO': 0.0, 'SPYU': 1.0, 'DJP': 0.0, 'BILL': 0.0},  # T4: 4.0x (All-in at the bottom)
            ]
        else:
            weights = [
                {'VOO': 1.0, 'SSO': 0.0, 'SPYU': 0.0, 'DJP': 0.0, 'BILL': 0.0},  # T0: 1.0x
                {'VOO': 0.5, 'SSO': 0.5, 'SPYU': 0.0, 'DJP': 0.0, 'BILL': 0.0},  # T1: 1.5x
                {'VOO': 0.0, 'SSO': 1.0, 'SPYU': 0.0, 'DJP': 0.0, 'BILL': 0.0},  # T2: 2.0x
                {'VOO': 0.0, 'SSO': 0.5, 'SPYU': 0.5, 'DJP': 0.0, 'BILL': 0.0},  # T3: 3.0x
                {'VOO': 0.0, 'SSO': 0.0, 'SPYU': 1.0, 'DJP': 0.0, 'BILL': 0.0},  # T4: 4.0x
            ]
        
        y_dd = spy_dd_global.shift(1).fillna(0)
        y_price = raw_df[TICKERS['VOO']].shift(1)
        y_price.iloc[0] = raw_df[TICKERS['VOO']].iloc[0]
        y_sma = spy_sma_200.shift(1)
        y_sma.iloc[0] = spy_sma_200.dropna().iloc[0] if not spy_sma_200.dropna().empty else y_price.iloc[0]
        
        def get_tier(dd):
            if dd <= -bounds[3]: return 4
            if dd <= -bounds[2]: return 3
            if dd <= -bounds[1]: return 2
            if dd <= -bounds[0]: return 1
            return 0

        if is_ratchet:
            tiers = []
            current_max_tier = 0
            for i in range(len(y_dd)):
                dd_val = y_dd.iloc[i]
                actual_tier = get_tier(dd_val)
                if dd_val >= 0: current_max_tier = 0
                elif actual_tier > current_max_tier: current_max_tier = actual_tier
                tiers.append(current_max_tier)
            daily_tiers = pd.Series(tiers, index=y_dd.index)
        else:
            daily_tiers = y_dd.apply(get_tier)
        
        if use_trend_filter:
            daily_tiers.loc[y_price < y_sma] = 0
            
        if rebalance_freq == 'Monthly':
            daily_tiers = daily_tiers.resample('ME').last().resample('D').ffill().reindex(daily_tiers.index).ffill()

        def map_weight(tier, asset):
            try: return weights[int(tier)][asset]
            except: return weights[0][asset]

        w_voo = daily_tiers.map(lambda x: map_weight(x, 'VOO'))
        w_sso = daily_tiers.map(lambda x: map_weight(x, 'SSO'))
        w_spyu = daily_tiers.map(lambda x: map_weight(x, 'SPYU'))
        w_djp = daily_tiers.map(lambda x: map_weight(x, 'DJP'))
        w_bill = daily_tiers.map(lambda x: map_weight(x, 'BILL'))
        
        # Calculate effective leverage multiplier: VOO=1x, SSO=2x, SPYU=4x
        eff_lev = (w_voo * 1 + w_sso * 2 + w_spyu * 4)
        
        strat_return = (w_voo * r_spy + w_sso * r_sso + w_spyu * r_spyu + w_djp * r_djp + w_bill * r_bill)
        return strat_return.loc[SIM_START:], eff_lev.loc[SIM_START:]

    print("Simulating variants...")
    variants = {}
    leverage = {}
    
    # Benchmarks
    variants['Benchmark SPY (1x)'] = r_spy.loc[SIM_START:]
    leverage['Benchmark SPY (1x)'] = pd.Series(1.0, index=variants['Benchmark SPY (1x)'].index)
    
    variants['Benchmark SSO (2x)'] = r_sso.loc[SIM_START:]
    leverage['Benchmark SSO (2x)'] = pd.Series(2.0, index=variants['Benchmark SSO (2x)'].index)
    
    variants['Benchmark SPYU (4x)'] = r_spyu.loc[SIM_START:]
    leverage['Benchmark SPYU (4x)'] = pd.Series(4.0, index=variants['Benchmark SPYU (4x)'].index)
    
    variants['Benchmark DJP (1x)'] = r_djp.loc[SIM_START:]
    leverage['Benchmark DJP (1x)'] = pd.Series(1.0, index=variants['Benchmark DJP (1x)'].index)
    
    # Strategies helper
    def add_strat(name, bounds, freq, safeties, ratchet=False):
        r, l = simulate_strategy(bounds, freq, safeties, is_ratchet=ratchet)
        variants[name] = r
        leverage[name] = l

    add_strat('Standard Daily Safeties', [0.05, 0.10, 0.20, 0.30], 'Daily', True)
    add_strat('Standard Daily Pure', [0.05, 0.10, 0.20, 0.30], 'Daily', False)
    add_strat('Standard Ratchet Safeties', [0.05, 0.10, 0.20, 0.30], 'Daily', True, True)
    add_strat('Standard Ratchet Pure', [0.05, 0.10, 0.20, 0.30], 'Daily', False, True)
    
    add_strat('Aggressive Daily Safeties', [0.03, 0.07, 0.12, 0.20], 'Daily', True)
    add_strat('Aggressive Daily Pure', [0.03, 0.07, 0.12, 0.20], 'Daily', False)
    add_strat('Aggressive Ratchet Safeties', [0.03, 0.07, 0.12, 0.20], 'Daily', True, True)
    add_strat('Aggressive Ratchet Pure', [0.03, 0.07, 0.12, 0.20], 'Daily', False, True)
    
    add_strat('Conservative Daily Safeties', [0.10, 0.20, 0.35, 0.50], 'Daily', True)
    add_strat('Conservative Daily Pure', [0.10, 0.20, 0.35, 0.50], 'Daily', False)
    add_strat('Conservative Ratchet Safeties', [0.10, 0.20, 0.35, 0.50], 'Daily', True, True)
    add_strat('Conservative Ratchet Pure', [0.10, 0.20, 0.35, 0.50], 'Daily', False, True)

    # Hall of Fame Special Variants (Optimized)
    def add_special(name, weights, bounds, ratchet):
        r, l = simulate_strategy(bounds, 'Daily', False, is_ratchet=ratchet, custom_weights=weights)
        variants[name] = r
        leverage[name] = l

    # [ THE DEEP BEAST ]
    # CAGR: 33.21%, DD: -72.92%, Sharpe: 0.70
    add_special('Special BEAST', [
        {'VOO': 0.38, 'SSO': 0.21, 'SPYU': 0.01, 'DJP': 0.40, 'BILL': 0.00},
        {'VOO': 0.00, 'SSO': 0.00, 'SPYU': 1.00, 'DJP': 0.00, 'BILL': 0.00},
        {'VOO': 0.00, 'SSO': 0.00, 'SPYU': 0.00, 'DJP': 1.00, 'BILL': 0.00},
        {'VOO': 0.00, 'SSO': 0.00, 'SPYU': 1.00, 'DJP': 0.00, 'BILL': 0.00},
        {'VOO': 0.13, 'SSO': 0.00, 'SPYU': 0.09, 'DJP': 0.48, 'BILL': 0.30}
    ], [0.01, 0.05, 0.09, 0.53], False)

    # [ THE DEEP SCALPEL ]
    # CAGR: 10.65%, DD: -13.68%, Sharpe: 0.88
    add_special('Special SCALPEL', [
        {'VOO': 0.13, 'SSO': 0.02, 'SPYU': 0.00, 'DJP': 0.07, 'BILL': 0.78},
        {'VOO': 0.59, 'SSO': 0.03, 'SPYU': 0.00, 'DJP': 0.32, 'BILL': 0.06},
        {'VOO': 0.06, 'SSO': 0.07, 'SPYU': 0.00, 'DJP': 0.81, 'BILL': 0.06},
        {'VOO': 0.25, 'SSO': 0.09, 'SPYU': 0.22, 'DJP': 0.20, 'BILL': 0.24},
        {'VOO': 0.87, 'SSO': 0.10, 'SPYU': 0.00, 'DJP': 0.03, 'BILL': 0.00}
    ], [0.01, 0.05, 0.30, 0.60], False)

    # [ THE DEEP SHIELD ]
    # CAGR: 8.02%, DD: -7.86%, Sharpe: 1.03
    add_special('Special SHIELD', [
        {'VOO': 0.01, 'SSO': 0.07, 'SPYU': 0.01, 'DJP': 0.00, 'BILL': 0.91},
        {'VOO': 0.04, 'SSO': 0.00, 'SPYU': 0.00, 'DJP': 0.80, 'BILL': 0.16},
        {'VOO': 0.02, 'SSO': 0.22, 'SPYU': 0.00, 'DJP': 0.01, 'BILL': 0.75},
        {'VOO': 0.73, 'SSO': 0.00, 'SPYU': 0.20, 'DJP': 0.05, 'BILL': 0.02},
        {'VOO': 0.01, 'SSO': 0.34, 'SPYU': 0.01, 'DJP': 0.63, 'BILL': 0.01}
    ], [0.05, 0.10, 0.39, 0.58], False)

    # Convert to JSON structure
    dates = variants['Benchmark SPY (1x)'].index.strftime('%Y-%m-%d').tolist()
    
    # 1. Export raw components for Browser-side "Strategy Lab"
    # Signals are calculated here to avoid complex price reconstruction in JS
    raw_sub = returns_raw.loc[SIM_START:]
    # Calculate price signal using the actual absolute price (not normalized cumulative)
    spy_absolute_price = raw_df[TICKERS['VOO']].loc[SIM_START:]
    signal_sma = (spy_absolute_price > spy_sma_200.loc[SIM_START:]).astype(int).tolist()
    
    data_out = {
        'dates': dates,
        'inflation': inflation_levels.loc[SIM_START:].tolist(),
        'variants': {name: v.tolist() for name, v in variants.items()},
        'leverage': {name: l.tolist() for name, l in leverage.items()},
        'raw_returns': {
            'VOO': raw_sub[TICKERS['VOO']].tolist(),
            'SSO': (raw_sub[TICKERS['VOO']] * 2.0).tolist(),
            'SPYU': (raw_sub[TICKERS['VOO']] * 4.0).tolist(),
            'BILL': raw_sub[TICKERS['BILL']].tolist(),
            'DJP': raw_sub[TICKERS['DJP']].tolist() if TICKERS['DJP'] in raw_sub.columns else [0.0]*len(raw_sub),
        },
        'signals': {
            'sma200': signal_sma
        }
    }
    
    with open('data.json', 'w') as f:
        json.dump(data_out, f)
    
    size_kb = os.path.getsize('data.json') / 1024
    print(f"Done! Exported to data.json ({size_kb:.0f} KB, {len(dates)} days)")

import os

if __name__ == "__main__":
    get_precomputed_data()
