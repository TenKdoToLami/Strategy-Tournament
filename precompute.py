import yfinance as yf
import pandas as pd
import numpy as np
import json
import os

# === Configuration ===
TICKERS = {
    'VOO': 'SPY',
    'BILL': 'VFISX',
    'DJP': 'PCRIX'
}
SIM_START = '2002-07-01'
PRIME_START = '2000-01-01'

def get_precomputed_data():
    print("Fetching market data...")
    raw_df = yf.download(list(TICKERS.values()), start=PRIME_START, auto_adjust=True)['Close'].ffill().dropna()
    
    returns_raw = raw_df.pct_change().fillna(0)
    r_spy = returns_raw.get(TICKERS['VOO'])
    r_bill = returns_raw.get(TICKERS['BILL'])
    r_djp = returns_raw.get(TICKERS['DJP'])

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
        y_price = raw_df[TICKERS['VOO']].shift(1).fillna(raw_df[TICKERS['VOO']].iloc[0])
        y_sma = spy_sma_200.shift(1).fillna(spy_sma_200.iloc[0])
        
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
        'Ratchet Standard': simulate_strategy([0.05, 0.10, 0.20, 0.30], 'Daily', True, is_ratchet=True),
        'Ratchet Pure Equity': simulate_strategy([0.05, 0.10, 0.20, 0.30], 'Daily', False, is_ratchet=True),
        'Pure Equities (No Bonds)': simulate_strategy([0.05, 0.10, 0.20, 0.30], 'Daily', False),
        'Aggressive (0/3/7/12/20)': simulate_strategy([0.03, 0.07, 0.12, 0.20], 'Daily', True),
        'Conservative (0/10/20/35/50)': simulate_strategy([0.10, 0.20, 0.35, 0.50], 'Daily', True),
    }

    # Convert to JSON structure
    # We store Dailies only to save space/allow date slicing in JS
    dates = variants['S&P 500 (1x)'].index.strftime('%Y-%m-%d').tolist()
    data_out = {
        'dates': dates,
        'variants': {name: values.tolist() for name, values in variants.items()}
    }
    
    with open('data.json', 'w') as f:
        json.dump(data_out, f)
    print("Done! Exported to data.json")

if __name__ == "__main__":
    get_precomputed_data()
