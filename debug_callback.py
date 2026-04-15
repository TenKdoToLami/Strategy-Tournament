import pandas as pd
import numpy as np
import yfinance as yf
from app import variants, update_dashboard
import traceback

# Simulate the callback call manually
print("\n--- TEST: Running Update Dashboard Manually ---")
start = "2002-07-01"
end = "2024-04-14"
trend = []

try:
    fig, table = update_dashboard(start, end)
    print("SUCCESS: Dashboard update completed without crashing.")
    print(f"Table data length: {len(table.data) if hasattr(table, 'data') else 'N/A'}")
except Exception as e:
    print("CRASH DETECTED:")
    traceback.print_exc()

print("\n--- TEST: Check Variance Series ---")
for name, ser in variants.items():
    print(f"{name}: len={len(ser)}, NaNs={ser.isna().sum()}")
