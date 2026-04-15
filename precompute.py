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
PRIME_START = '2000-01-01'

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

    def simulate_strategy(bounds, rebalance_freq='Daily', include_safeties=True, use_trend_filter=True, is_ratchet=False):
        if include_safeties:
            weights = [
                {'VOO': 0.80, 'SSO': 0.00, 'SPYU': 0.00, 'DJP': 0.10, 'BILL': 0.10}, 
                {'VOO': 0.60, 'SSO': 0.20, 'SPYU': 0.00, 'DJP': 0.10, 'BILL': 0.10},
                {'VOO': 0.30, 'SSO': 0.25, 'SPYU': 0.25, 'DJP': 0.10, 'BILL': 0.10},
                {'VOO': 0.10, 'SSO': 0.35, 'SPYU': 0.35, 'DJP': 0.10, 'BILL': 0.10},
                {'VOO': 0.00, 'SSO': 0.50, 'SPYU': 0.50, 'DJP': 0.00, 'BILL': 0.00},
            ]
        else:
            weights = [
                {'VOO': 1.00, 'SSO': 0.00, 'SPYU': 0.00, 'DJP': 0.00, 'BILL': 0.00},
                {'VOO': 0.75, 'SSO': 0.25, 'SPYU': 0.00, 'DJP': 0.00, 'BILL': 0.00},
                {'VOO': 0.38, 'SSO': 0.31, 'SPYU': 0.31, 'DJP': 0.00, 'BILL': 0.00},
                {'VOO': 0.12, 'SSO': 0.44, 'SPYU': 0.44, 'DJP': 0.00, 'BILL': 0.00},
                {'VOO': 0.00, 'SSO': 0.50, 'SPYU': 0.50, 'DJP': 0.00, 'BILL': 0.00},
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
        
        strat_return = (w_voo * r_spy + w_sso * r_sso + w_spyu * r_spyu + w_djp * r_djp + w_bill * r_bill)
        return strat_return.loc[SIM_START:]

    print("Simulating variants...")
    variants = {
        'S&P 500 (1x)': r_spy.loc[SIM_START:],
        'SSO (2x Benchmark)': r_sso.loc[SIM_START:],
        'SPYU (4x Benchmark)': r_spyu.loc[SIM_START:],
        'Standard (0/5/10/20/30)': simulate_strategy([0.05, 0.10, 0.20, 0.30], 'Daily', True),
        'Standard Pure Equity': simulate_strategy([0.05, 0.10, 0.20, 0.30], 'Daily', False),
        'Ratchet Standard': simulate_strategy([0.05, 0.10, 0.20, 0.30], 'Daily', True, is_ratchet=True),
        'Ratchet Pure Equity': simulate_strategy([0.05, 0.10, 0.20, 0.30], 'Daily', False, is_ratchet=True),
        'Aggressive (0/3/7/12/20)': simulate_strategy([0.03, 0.07, 0.12, 0.20], 'Daily', True),
        'Aggressive Pure Equity': simulate_strategy([0.03, 0.07, 0.12, 0.20], 'Daily', False),
        'Aggressive Ratchet': simulate_strategy([0.03, 0.07, 0.12, 0.20], 'Daily', True, is_ratchet=True),
        'Aggressive Ratchet Pure': simulate_strategy([0.03, 0.07, 0.12, 0.20], 'Daily', False, is_ratchet=True),
        'Conservative (0/10/20/35/50)': simulate_strategy([0.10, 0.20, 0.35, 0.50], 'Daily', True),
        'Conservative Pure Equity': simulate_strategy([0.10, 0.20, 0.35, 0.50], 'Daily', False),
        'Conservative Ratchet': simulate_strategy([0.10, 0.20, 0.35, 0.50], 'Daily', True, is_ratchet=True),
        'Conservative Ratchet Pure': simulate_strategy([0.10, 0.20, 0.35, 0.50], 'Daily', False, is_ratchet=True),
    }

    # Convert to JSON structure
    dates = variants['S&P 500 (1x)'].index.strftime('%Y-%m-%d').tolist()
    data_out = {
        'dates': dates,
        'variants': {name: values.tolist() for name, values in variants.items()}
    }
    
    with open('data.json', 'w') as f:
        json.dump(data_out, f)
    
    size_kb = os.path.getsize('data.json') / 1024
    print(f"Done! Exported to data.json ({size_kb:.0f} KB, {len(dates)} days)")

import os

if __name__ == "__main__":
    get_precomputed_data()
