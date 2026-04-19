import yfinance as yf
import pandas as pd
import numpy as np
import json
import time
import re
import os

# === Configuration ===
TICKERS = {
    'VOO': 'SPY',
    'BILL': 'VFISX',
    'DJP': 'PCRIX'
}
SIM_START = '2002-07-01'
PRIME_START = '2002-07-01'

def fetch_single(ticker, start, retries=3):
    """Download a single ticker with retries to handle yfinance lock errors."""
    for attempt in range(retries):
        try:
            df = yf.download(ticker, start=start, auto_adjust=True, progress=False)
            if df is not None and not df.empty:
                if 'Close' in df.columns:
                    return df['Close'].squeeze()
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
    print("Fetching market data...")
    
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
    r_djp = returns_raw[TICKERS['DJP']] if TICKERS['DJP'] in returns_raw.columns else pd.Series(0.0, index=r_spy.index)
    
    # Leveraged synthetic assets
    r_sso  = r_spy * 2 - r_bill * 1
    r_spyu = r_spy * 4 - r_bill * 3

    spy_cum_global = (1 + r_spy).cumprod()
    spy_ath_global = spy_cum_global.cummax()
    spy_dd_global = (spy_cum_global - spy_ath_global) / spy_ath_global
    spy_sma_200 = raw_df[TICKERS['VOO']].rolling(200).mean()

    # --- Fetch Inflation (CPI) ---
    print("  Calculating inflation baseline...")
    try:
        cpi_url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL"
        cpi_raw = pd.read_csv(cpi_url, index_col='observation_date', parse_dates=['observation_date'])
        cpi_monthly = cpi_raw['CPIAUCSL']
        cpi_daily = cpi_monthly.reindex(raw_df.index).interpolate(method='linear').ffill().bfill()
        inflation_levels = cpi_daily / cpi_daily.loc[SIM_START:].iloc[0]
    except Exception as e:
        print(f"  WARNING: Using fixed inflation fallback ({e})")
        days = (raw_df.index - raw_df.index[0]).days
        inflation_levels = pd.Series(np.exp(days * np.log(1.025) / 365.25), index=raw_df.index)

    def simulate_strategy(bounds, include_safeties=True, use_trend_filter=True, is_ratchet=False, custom_weights=None):
        # Normalize weights to standard format [VOO, SSO, SPYU, DJP, BILL]
        ws = custom_weights
        if ws is None:
            if include_safeties:
                ws = [[80, 0, 0, 10, 10], [40, 40, 0, 10, 10], [0, 80, 0, 10, 10], [0, 40, 40, 10, 10], [0, 0, 100, 0, 0]]
            else:
                ws = [[100, 0, 0, 0, 0], [50, 50, 0, 0, 0], [0, 100, 0, 0, 0], [0, 50, 50, 0, 0], [0, 0, 100, 0, 0]]
        
        # Ensure 0.0-1.0 scale
        processed_ws = []
        for tier in ws:
            row = []
            for v in tier:
                row.append(v / 100.0 if v > 1.1 else v)
            processed_ws.append(row)
        
        y_dd = spy_dd_global.shift(1).fillna(0)
        y_price = raw_df[TICKERS['VOO']].shift(1)
        y_sma = spy_sma_200.shift(1)
        
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
            
        def get_weights_for_tier(tier):
            t = int(tier)
            if t >= len(processed_ws): return processed_ws[-1]
            return processed_ws[t]

        asset_returns = [r_spy, r_sso, r_spyu, r_djp, r_bill]
        strat_return = pd.Series(0.0, index=daily_tiers.index)
        eff_lev = pd.Series(0.0, index=daily_tiers.index)

        for asset_idx in range(5):
            w_series = daily_tiers.map(lambda t: get_weights_for_tier(t)[asset_idx])
            strat_return += w_series * asset_returns[asset_idx]
            if asset_idx < 3: # Leverage assets
                mult = [1, 2, 4][asset_idx]
                eff_lev += w_series * mult

        return strat_return.loc[SIM_START:], eff_lev.loc[SIM_START:]

    def load_registry():
        reg_path = os.path.join('assets', 'js', 'strategies.js')
        if not os.path.exists(reg_path):
            print(f"  WARNING: Strategy Registry not found at {reg_path}")
            return []
        
        with open(reg_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        match = re.search(r'const STRATEGY_REGISTRY_DATA = (\[[\s\S]*?\]);', content)
        if not match:
            print("  ERROR: Could not parse STRATEGY_REGISTRY_DATA from JS file.")
            return []
        
        json_str = match.group(1)
        json_str = re.sub(r'//.*', '', json_str) # Comments
        json_str = re.sub(r',\s*\]', ']', json_str) 
        json_str = re.sub(r',\s*\}', '}', json_str) 
        
        # Quote unquoted keys for JSON compliance
        json_str = re.sub(r'([{,]\s*)(\w+):', r'\1"\2":', json_str)
        # Convert single quotes to double quotes
        json_str = json_str.replace("'", '"')
        
        try:
            return json.loads(json_str)
        except Exception as e:
            print(f"  ERROR: JSON parsing failed: {e}")
            return []

    print("Loading strategy registry from JS...")
    registry = load_registry()
    if not registry:
        print("  FATAL: Registry is empty or failed to load.")
        return

    print(f"Simulating {len(registry)} strategies from registry...")
    variants = {}
    leverage = {}
    weights_out = {}
    bounds_out = {}

    for strat in registry:
        name = strat['id']
        print(f"  Simulating {name}...")
        
        p = strat.get('params', {})
        r, l = simulate_strategy(
            bounds=strat['bounds'],
            include_safeties=p.get('mix') == 'Safeties',
            is_ratchet=p.get('logic') == 'Ratchet',
            use_trend_filter=p.get('trend', True),
            custom_weights=strat['weights']
        )
        
        variants[name] = r
        leverage[name] = l
        weights_out[name] = [[v if v > 1.1 else v * 100 for v in tier] for tier in strat['weights']]
        bounds_out[name] = strat['bounds']

    dates = variants['Benchmark SPY (1x)'].index.strftime('%Y-%m-%d').tolist()
    raw_sub = returns_raw.loc[SIM_START:]
    spy_absolute_price = raw_df[TICKERS['VOO']].loc[SIM_START:]
    signal_sma = (spy_absolute_price > spy_sma_200.loc[SIM_START:]).astype(int).tolist()
    
    data_out = {
        'dates': dates,
        'inflation': inflation_levels.loc[SIM_START:].tolist(),
        'variants': {name: v.tolist() for name, v in variants.items()},
        'leverage': {name: l.tolist() for name, l in leverage.items()},
        'weights': weights_out,
        'bounds': bounds_out,
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
    
    if not os.path.exists('data'): os.makedirs('data')
    with open('data/data.json', 'w') as f:
        json.dump(data_out, f)
    
    print(f"Done! Exported {len(variants)} variants across {len(dates)} days.")

if __name__ == "__main__":
    get_precomputed_data()
