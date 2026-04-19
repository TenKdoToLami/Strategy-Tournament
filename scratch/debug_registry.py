import os
import re
import json

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
        data = json.loads(json_str)
        for s in data:
            if s['id'] == 'Special BEAST':
                print(f"BEAST Params: {s.get('params')}")
    except Exception as e:
        print(f"Error: {e}")

load_registry()
