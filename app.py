import dash
from dash import dcc, html, Input, Output, dash_table
from dash.exceptions import PreventUpdate
import yfinance as yf
import pandas as pd
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import traceback

# === Configuration ===
TICKERS = {
    'VOO': 'SPY',
    'BILL': 'VFISX',
    'DJP': 'PCRIX'
}
SIM_START = '2002-07-01'
PRIME_START = '2000-01-01'

# --- 1. Data Prep ---
def fetch_data():
    try:
        print("Fetching Total Return data...")
        df = yf.download(list(TICKERS.values()), start=PRIME_START, auto_adjust=True)['Close']
        df = df.ffill().dropna()
        return df
    except Exception as e:
        print(f"FATAL ERROR FETCHING DATA: {e}")
        return pd.DataFrame()

raw_df = fetch_data()

# Global Pre-calculations
returns_raw = raw_df.pct_change().fillna(0)
r_spy = returns_raw.get(TICKERS['VOO'], pd.Series(dtype=float))
r_bill = returns_raw.get(TICKERS['BILL'], pd.Series(dtype=float))
r_djp = returns_raw.get(TICKERS['DJP'], pd.Series(dtype=float))

r_sso  = r_spy * 2 - r_bill * 1
r_spyu = r_spy * 4 - r_bill * 3

spy_cum_global = (1 + r_spy).cumprod()
spy_ath_global = spy_cum_global.cummax()
spy_dd_global = (spy_cum_global - spy_ath_global) / spy_ath_global
spy_sma_200 = raw_df[TICKERS['VOO']].rolling(200).mean()

# --- 2. Strategy Engine ---
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
        # Pure Equities (No Bonds/Commodities)
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

    # Calculate Tiers
    if is_ratchet:
        # Stateful loop for Ratchet logic
        tiers = []
        current_max_tier = 0
        for i in range(len(y_dd)):
            # reset core drawdown to 0 for analysis
            dd_val = y_dd.iloc[i]
            actual_tier = get_tier(dd_val)
            
            if dd_val >= 0: # Hit new ATH
                current_max_tier = 0
            elif actual_tier > current_max_tier: # Going deeper
                current_max_tier = actual_tier
            # Otherwise, keep current_max_tier (Ratchet effect)
            
            tiers.append(current_max_tier)
        daily_tiers = pd.Series(tiers, index=y_dd.index)
    else:
        daily_tiers = y_dd.apply(get_tier)
    
    # Trend Filter Override (Safety always wins)
    if use_trend_filter:
        daily_tiers.loc[y_price < y_sma] = 0
        
    # Rebalancing Frequencies
    if rebalance_freq == 'Monthly':
        daily_tiers = daily_tiers.resample('ME').last().resample('D').ffill().reindex(daily_tiers.index).ffill()
    elif rebalance_freq == 'Quarterly':
        daily_tiers = daily_tiers.resample('QE').last().resample('D').ffill().reindex(daily_tiers.index).ffill()

    def map_weight(tier, asset):
        try:
            return weights[int(tier)][asset]
        except:
            return weights[0][asset]

    w_voo = daily_tiers.map(lambda x: map_weight(x, 'VOO'))
    w_sso = daily_tiers.map(lambda x: map_weight(x, 'SSO'))
    w_spyu = daily_tiers.map(lambda x: map_weight(x, 'SPYU'))
    w_djp = daily_tiers.map(lambda x: map_weight(x, 'DJP'))
    w_bill = daily_tiers.map(lambda x: map_weight(x, 'BILL'))
    
    strat_return = (w_voo * r_spy + w_sso * r_sso + w_spyu * r_spyu + w_djp * r_djp + w_bill * r_bill)
    return strat_return.loc[SIM_START:]

# --- 3. Pre-Calculate Variants ---
print("Calculating variants...")
variants = {
    'S&P 500 (Benchmark)': r_spy.loc[SIM_START:],
    'SSO 2x (Benchmark)': r_sso.loc[SIM_START:],
    'SPYU 4x (Benchmark)': r_spyu.loc[SIM_START:],
    'Standard (0/5/10/20/30)': simulate_strategy([0.05, 0.10, 0.20, 0.30], 'Daily', True),
    'Ratchet Standard': simulate_strategy([0.05, 0.10, 0.20, 0.30], 'Daily', True, is_ratchet=True),
    'Ratchet Pure Equity': simulate_strategy([0.05, 0.10, 0.20, 0.30], 'Daily', False, is_ratchet=True),
    'Pure Equities (No Bonds)': simulate_strategy([0.05, 0.10, 0.20, 0.30], 'Daily', False),
    'Aggressive (0/3/7/12/20)': simulate_strategy([0.03, 0.07, 0.12, 0.20], 'Daily', True),
    'Conservative (0/10/20/35/50)': simulate_strategy([0.10, 0.20, 0.35, 0.50], 'Daily', True),
    'Monthly Standard': simulate_strategy([0.05, 0.10, 0.20, 0.30], 'Monthly', True),
}

dates_global = variants['S&P 500 (Benchmark)'].index
min_date = dates_global.min()
max_date = dates_global.max()

# --- 4. Dash UI ---
app = dash.Dash(__name__, title="Advanced Strategy Comparison")
server = app.server # Expose for Gunicorn/Heroku/Render

app.layout = html.Div(style={'backgroundColor': '#0a0a0a', 'color': '#f2f2f2', 'padding': '20px', 'fontFamily': 'Roboto, sans-serif'}, children=[
    html.H1("Dynamic Tournament: Multi-Strategy Engine", style={'textAlign': 'center', 'color': '#00ffcc', 'marginBottom': '30px', 'fontSize': '36px'}),
    
    html.Div([
        html.Label("Timeframe for Performance Comparison:", style={'fontWeight': 'bold', 'marginRight': '15px'}),
        dcc.DatePickerRange(
            id='date-picker',
            min_date_allowed=min_date, max_date_allowed=max_date,
            start_date=min_date, end_date=max_date,
            display_format='YYYY-MM-DD'
        )
    ], style={'textAlign': 'center', 'backgroundColor': '#1a1a1a', 'padding': '25px', 'borderRadius': '15px', 'marginBottom': '30px'}),

    html.Div(id='metrics-table-container'),
    dcc.Graph(id='comparison-graph', style={'height': '1000px'}),
    
    html.Div(style={'backgroundColor': '#111', 'padding': '40px', 'borderRadius': '15px', 'marginTop': '40px', 'lineHeight': '1.6'}, children=[
        html.H2("Technical Strategy Specifications", style={'color': '#00ffcc', 'borderBottom': '1px solid #333', 'paddingBottom': '15px'}),
        
        dcc.Markdown('''
### **1. Glossary of Underlying Assets (Actives)**
To ensure maximum accuracy, the following proxies are used to simulate historical returns including dividends and yield:
*   **VOO (S&P 500)**: 1x Core Equity exposure. Proxied by **SPY** (Total Return).
*   **SSO (2x S&P 500)**: 2x Leveraged Equity. Simulated as `(2 * Daily_SPY) - (1 * Daily_Bonds)`.
*   **SPYU (4x S&P 500)**: 4x Leveraged Equity. Simulated as `(4 * Daily_SPY) - (3 * Daily_Bonds)`.
*   **BILL (Treasury Bonds)**: Safe cash-equivalent. Proxied by **VFISX** (Short-Term Treasury).
*   **DJP (Commodities)**: Inflation hedge. Proxied by **PCRIX** (Commodity Real Return).

---

### **2. Asset Allocation Tier Matrix**
The strategy shifts weights based on the **Previous Day's Drawdown** (distance from All-Time High).

#### **"Standard" Variants (20% Safety Net)**
| Drawdown Tier | VOO (1x) | SSO (2x) | SPYU (4x) | DJP (Comm) | BILL (Cash) | **Eff. Leverage** |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Safe (0% to -5%)** | 80% | 0% | 0% | 10% | 10% | **~0.8x** |
| **Tier 1 (-5% to -10%)** | 60% | 20% | 0% | 10% | 10% | **~1.0x** |
| **Tier 2 (-10% to -20%)** | 30% | 25% | 25% | 10% | 10% | **~1.8x** |
| **Tier 3 (-20% to -30%)** | 10% | 35% | 35% | 10% | 10% | **~2.2x** |
| **Tier 4 (> -30%)** | 0% | 50% | 50% | 0% | 0% | **3.0x** |

#### **"Pure Equity" Variants (0% Safety Net)**
| Drawdown Tier | VOO (1x) | SSO (2x) | SPYU (4x) | DJP (Comm) | BILL (Cash) | **Eff. Leverage** |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Safe (0% to -5%)** | 100% | 0% | 0% | 0% | 0% | **1.0x** |
| **Tier 1 (-5% to -10%)** | 75% | 25% | 0% | 0% | 0% | **1.25x** |
| **Tier 2 (-10% to -20%)** | 38% | 31% | 31% | 0% | 0% | **1.9x** |
| **Tier 3 (-20% to -30%)** | 12% | 44% | 44% | 0% | 0% | **2.6x** |
| **Tier 4 (> -30%)** | 0% | 50% | 50% | 0% | 0% | **3.0x** |

---

### **3. Calculation Methodology**
#### **A. Leveraged Return Calculation**
Leverage is not free. We subtract the **Risk-Free Rate** (BILL/VFISX return) to model the cost of borrowing cash to maintain the 2x or 4x positions. 
`Return = (Leverage * S&P500_Return) - ((Leverage - 1) * Bond_Return)`

#### **B. Trend Filter (SMA 200)**
If the S&P 500 closes below its **200-day Simple Moving Average**, all strategies (except Benchmark) automatically revert to the **Safe Tier** (Tier 0). This logic overrides both the Drawdown Tiers and the Ratchet logic for survival.

#### **C. Rebalancing Rules**
*   **Daily**: Recalculates weights every business day.
*   **Monthly / Quarterly**: Samples the signal on the last day of the period and locks that allocation for the entire subsequent month/quarter.
*   **Ratchet**: Locks in any increase in leverage level. If a crash hits -20% (Tier 3), it stays at Tier 3 even if the market bounces to -5%. Only resets to Tier 0 once a **new All-Time High** is reached.

---

### **4. Key Performance Indicators (KPIs) Explained**
*   **Total %**: The simple percentage growth of your capital from day 1 of the selected timeframe. 
*   **CAGR (Compound Annual Growth Rate)**: The "smoothed" annual rate of return. It assumes all gains are reinvested and tells you what the consistent yearly return was.
*   **Avg. Ann. Ret (Average Annual Return)**: The mathematical average of yearly results. Often higher than CAGR due to volatility.
*   **Max DD (Max Drawdown)**: The largest single "peak-to-trough" decline experienced. It represents the worst-case scenario pain during a crash.
*   **Sharpe Ratio**: Risk-adjusted return. It measures how much "excess return" you get for every unit of volatility. Higher is better (above 1.0 is excellent).
*   **Ann. Vol (Annualized Volatility)**: The intensity of the daily swings. Higher values mean more emotional stress but potentially higher rewards.
        ''', style={'fontSize': '15px'})
    ])
])

@app.callback(
    [Output('comparison-graph', 'figure'),
     Output('metrics-table-container', 'children')],
    [Input('date-picker', 'start_date'),
     Input('date-picker', 'end_date')]
)
def update_dashboard(start_date, end_date):
    if not start_date or not end_date:
        raise PreventUpdate

    try:
        plot_data = {}
        metrics = []
        
        start_ts = pd.to_datetime(start_date)
        end_ts = pd.to_datetime(end_date)
        years = (end_ts - start_ts).days / 365.25 if (end_ts - start_ts).days > 0 else 1

        for name, daily_ret in variants.items():
            slice_ret = daily_ret.loc[start_ts:end_ts]
            if slice_ret.empty: continue
            
            cum_ret = (1 + slice_ret).cumprod()
            plot_data[name] = cum_ret
            
            final_val = cum_ret.iloc[-1]
            cagr = (max(1e-8, final_val) ** (1/years) - 1) if final_val > 0 else -1.0
            avg_ann_ret = slice_ret.mean() * 252
            dd = (cum_ret - cum_ret.cummax()) / cum_ret.cummax()
            max_dd = dd.min()
            vol = slice_ret.std() * np.sqrt(252)
            sharpe = (cagr - 0.02) / vol if (vol > 0.001 and np.isfinite(cagr)) else 0

            metrics.append({
                'Strategy': name,
                'Total %': final_val - 1,
                'CAGR': cagr,
                'Avg Ann Ret': avg_ann_ret,
                'Max DD': max_dd,
                'Sharpe': sharpe,
                'Ann. Vol': vol
            })

        if not plot_data:
            return go.Figure(), "No data for this range."

        # Subplots
        fig = make_subplots(rows=2, cols=1, shared_xaxes=True, vertical_spacing=0.07, row_heights=[0.6, 0.4])
        colors = ['#ff9900', '#00ffcc', '#dc3912', '#3366cc', '#ff00ff', '#109618', '#00bfff', '#990099', '#f2f2f2', '#888']
        
        for i, (name, cum) in enumerate(plot_data.items()):
            color = colors[i % len(colors)]
            width = 3 if 'Ratchet' in name or 'Standard' in name else 1.5
            fig.add_trace(go.Scatter(x=cum.index, y=cum-1, mode='lines', name=name, line=dict(color=color, width=width)), row=1, col=1)
            fig.add_trace(go.Scatter(x=cum.index, y=np.maximum(1e-6, cum), mode='lines', name=name, line=dict(color=color, width=width), showlegend=False), row=2, col=1)

        fig.update_layout(template='plotly_dark', hovermode='x unified', margin=dict(l=40, r=40, t=20, b=20), legend=dict(orientation="h", y=1.05))
        fig.update_yaxes(tickformat=".0%", row=1, col=1)
        fig.update_yaxes(type='log', row=2, col=1)
        
        # Fixing column formatting for numeric sorting
        from dash.dash_table import FormatTemplate
        percentage = FormatTemplate.percentage(1)
        
        columns = [
            {"name": "Strategy", "id": "Strategy"},
            {"name": "Total %", "id": "Total %", "type": "numeric", "format": percentage},
            {"name": "CAGR", "id": "CAGR", "type": "numeric", "format": percentage},
            {"name": "Avg Ann Ret", "id": "Avg Ann Ret", "type": "numeric", "format": percentage},
            {"name": "Max DD", "id": "Max DD", "type": "numeric", "format": percentage},
            {"name": "Sharpe", "id": "Sharpe", "type": "numeric", "format": {"specifier": ".2f"}},
            {"name": "Ann. Vol", "id": "Ann. Vol", "type": "numeric", "format": percentage},
        ]

        table = dash_table.DataTable(
            data=metrics,
            columns=columns,
            style_as_list_view=True,
            sort_action="native",
            style_header={'backgroundColor': '#222', 'color': '#00ffcc', 'fontWeight': 'bold'},
            style_cell={'backgroundColor': '#111', 'color': '#eee', 'textAlign': 'left', 'padding': '12px', 'fontSize': '14px'}
        )
        return fig, table
        
    except Exception as e:
        print("ERROR IN CALLBACK:")
        traceback.print_exc()
        return go.Figure(), f"Error: {e}"

if __name__ == '__main__':
    app.run(debug=False, port=8050)
