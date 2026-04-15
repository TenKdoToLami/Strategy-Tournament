import yfinance as yf
import pandas as pd
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots

# === Configuration ===
# Proxies chosen for longest possible history
TICKERS = {
    'VOO': 'SPY',     # S&P 500 (since 1993)
    'BILL': 'VFISX',  # Vanguard Short-Term Treasury (since 1991)
    'DJP': 'PCRIX'    # PIMCO Commodity Real Return (since 2002)
}
# Start simulation when all data is available
START_DATE = '2002-07-01'
END_DATE = None # Latest

def fetch_data():
    print("Fetching data from Yahoo Finance...")
    tickers_list = list(TICKERS.values())
    df = yf.download(tickers_list, start=START_DATE, end=END_DATE)['Close']
    df = df.ffill().dropna()
    return df

def apply_allocations(dd):
    if dd <= -0.30:
        return pd.Series({'VOO': 0.0, 'SSO': 0.40, 'SPYU': 0.60, 'DJP': 0.0, 'BILL': 0.0})
    elif dd <= -0.20:
        return pd.Series({'VOO': 0.10, 'SSO': 0.35, 'SPYU': 0.35, 'DJP': 0.10, 'BILL': 0.10})
    elif dd <= -0.10:
        return pd.Series({'VOO': 0.30, 'SSO': 0.25, 'SPYU': 0.25, 'DJP': 0.10, 'BILL': 0.10})
    elif dd <= -0.05:
        return pd.Series({'VOO': 0.60, 'SSO': 0.20, 'SPYU': 0.0, 'DJP': 0.10, 'BILL': 0.10})
    else: # 0 to -5%
        return pd.Series({'VOO': 0.80, 'SSO': 0.0, 'SPYU': 0.0, 'DJP': 0.10, 'BILL': 0.10})

def run_simulation(data):
    print("Calculating daily returns and strategy simulation...")
    
    # Calculate daily returns
    returns = data.pct_change().fillna(0)
    
    r_spy = returns[TICKERS['VOO']]
    r_bill = returns[TICKERS['BILL']]
    r_djp = returns[TICKERS['DJP']]
    
    # Synthetic leveraged ETFs (incorporating borrowing costs pegged to the short-term treasury rate)
    r_sso  = r_spy * 2 - r_bill * 1
    r_spyu = r_spy * 4 - r_bill * 3
    
    # Calculate S&P 500 All-Time Highs & Drawdown
    spy_cum = (1 + r_spy).cumprod()
    spy_ath = spy_cum.cummax()
    spy_dd = (spy_cum - spy_ath) / spy_ath
    
    # Pre-calculate allocation weights dynamically per row based on yesterday's drawdown 
    # to avoid look-ahead bias
    prev_spy_dd = spy_dd.shift(1).fillna(0)
    
    # Apply allocations
    allocs = prev_spy_dd.apply(apply_allocations)
    
    # Calculate Strategy Daily Return
    strat_return = (
        allocs['VOO'] * r_spy +
        allocs['SSO'] * r_sso +
        allocs['SPYU'] * r_spyu +
        allocs['DJP'] * r_djp +
        allocs['BILL'] * r_bill
    )
    
    # Calculate Cumulative Returns
    strat_cum = (1 + strat_return).cumprod()
    
    return {
        'spy_cum': spy_cum,
        'strat_cum': strat_cum,
        'spy_dd': spy_dd,
        'strat_dd': (strat_cum - strat_cum.cummax()) / strat_cum.cummax(),
        'allocs': allocs,
        'dates': data.index,
        'strat_return': strat_return,
        'spy_return': r_spy
    }

def create_charts(results):
    print("Generating interactive charts...")
    dates = results['dates']
    spy_cum = results['spy_cum']
    strat_cum = results['strat_cum']
    
    fig = make_subplots(
        rows=5, cols=1, 
        shared_xaxes=True,
        vertical_spacing=0.05,
        row_heights=[0.25, 0.25, 0.15, 0.15, 0.2],
        subplot_titles=("Cumulative Growth (Log Scale)", "Cumulative Performance (%)", "Daily Performance (%)", "Drawdowns", "Portfolio Allocation Breakdown")
    )
    
    # 1. Cumulative Growth Chart
    fig.add_trace(go.Scatter(x=dates, y=strat_cum, mode='lines', name='Dynamic Strategy', line=dict(color='#00ffcc', width=2)), row=1, col=1)
    fig.add_trace(go.Scatter(x=dates, y=spy_cum, mode='lines', name='100% S&P 500 (SPY)', line=dict(color='#ff9900', width=1.5, dash='dash')), row=1, col=1)
    
    # 2. Cumulative Performance Chart (Linear)
    fig.add_trace(go.Scatter(x=dates, y=strat_cum - 1, mode='lines', name='Strategy Cum. Return', line=dict(color='#00ffcc', width=2)), row=2, col=1)
    fig.add_trace(go.Scatter(x=dates, y=spy_cum - 1, mode='lines', name='S&P 500 Cum. Return', line=dict(color='#ff9900', width=1.5, dash='dash')), row=2, col=1)

    # 3. Daily Performance Chart
    fig.add_trace(go.Scatter(x=dates, y=results['strat_return'], mode='lines', name='Strategy Daily', line=dict(color='rgba(0, 255, 204, 0.5)', width=1)), row=3, col=1)
    fig.add_trace(go.Scatter(x=dates, y=results['spy_return'], mode='lines', name='S&P 500 Daily', line=dict(color='rgba(255, 153, 0, 0.3)', width=1)), row=3, col=1)
    
    # 4. Drawdowns Chart
    fig.add_trace(go.Scatter(x=dates, y=results['strat_dd'], fill='tozeroy', name='Strategy Drawdown', line=dict(color='rgba(0, 255, 204, 0.5)', width=1)), row=4, col=1)
    fig.add_trace(go.Scatter(x=dates, y=results['spy_dd'], name='S&P 500 Drawdown', line=dict(color='rgba(255, 153, 0, 0.7)', width=1)), row=4, col=1)
    
    # 5. Allocations Area Chart
    allocs = results['allocs']
    colors = {'VOO': '#3366cc', 'SSO': '#990099', 'SPYU': '#dc3912', 'DJP': '#ff9900', 'BILL': '#109618'}
    for col in allocs.columns:
        fig.add_trace(go.Scatter(
            x=dates,
            y=allocs[col],
            mode='lines',
            stackgroup='one',
            name=f'{col} Weight',
            line=dict(color=colors.get(col, '#ccc'))
        ), row=5, col=1)

    # Formatting
    fig.update_layout(
        title="Dynamic Drawdown-Based Strategy Simulation (2002 - Present)",
        height=1400,
        template='plotly_dark',
        hovermode='x unified',
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
    )
    
    fig.update_yaxes(type='log', row=1, col=1)
    fig.update_yaxes(tickformat=".0%", row=2, col=1)
    fig.update_yaxes(tickformat=".2%", row=3, col=1)
    fig.update_yaxes(tickformat=".0%", row=4, col=1)
    fig.update_yaxes(tickformat=".0%", range=[0, 1], row=5, col=1)
    
    output_file = "drawdown_strategy_report.html"
    fig.write_html(output_file)
    print(f"Simulation completed! Report saved to {output_file}")
    
    # Print metrics
    print("\n=== Performance Metrics ===")
    strat_ann = strat_cum.iloc[-1] ** (252 / len(strat_cum)) - 1
    spy_ann = spy_cum.iloc[-1] ** (252 / len(spy_cum)) - 1
    strat_maxdd = results['strat_dd'].min()
    spy_maxdd = results['spy_dd'].min()
    
    print(f"Strategy CAGR:     {strat_ann:.2%}")
    print(f"S&P 500 CAGR:      {spy_ann:.2%}")
    print(f"Strategy Max DD:   {strat_maxdd:.2%}")
    print(f"S&P 500 Max DD:    {spy_maxdd:.2%}")

if __name__ == "__main__":
    df = fetch_data()
    results = run_simulation(df)
    create_charts(results)
