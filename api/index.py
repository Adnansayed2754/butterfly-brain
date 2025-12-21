from http.server import BaseHTTPRequestHandler
import json
import yfinance as yf
import pandas as pd
import numpy as np
import re
import datetime
import time

# --- CONFIGURATION ---
CACHE = { "data": None, "last_updated": 0 }
BENCHMARKS = ["SPY", "QQQ", "^TNX", "BTC-USD", "GC=F", "CL=F", "NVDA", "^VIX", "DX-Y.NYB"]

LABEL_MAP = {
    "GC=F": "GOLD", "CL=F": "OIL", "LIT": "LITHIUM", "^TNX": "RATES", 
    "TSM": "TSMC", "BTC-USD": "BITCOIN", "NVDA": "NVIDIA", "SPY": "S&P 500", 
    "QQQ": "NASDAQ", "^VIX": "VIX", "DX-Y.NYB": "US DOLLAR"
}

# --- SANITIZER ---
def sanitize_for_json(obj):
    if isinstance(obj, (np.int8, np.int16, np.int32, np.int64, np.uint8, np.uint16, np.uint32, np.uint64)):
        return int(obj)
    elif isinstance(obj, (np.float16, np.float32, np.float64)):
        return float(obj) if not np.isnan(obj) and not np.isinf(obj) else 0.0
    elif isinstance(obj, (np.bool_)):
        return bool(obj)
    elif isinstance(obj, (np.ndarray,)):
        return [sanitize_for_json(x) for x in obj]
    elif isinstance(obj, (pd.Timestamp, datetime.date, datetime.datetime)):
        return obj.isoformat()
    elif isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(x) for x in obj]
    elif pd.isna(obj):
        return None
    return obj

# --- DATA FETCHING ---
def get_benchmarks():
    now = time.time()
    if CACHE["data"] is None or (now - CACHE["last_updated"] > 3600):
        try:
            data = yf.download(BENCHMARKS, period="1y", interval="1d", progress=False, auto_adjust=True)
            if not data.empty and 'Close' in data:
                CACHE["data"] = data['Close']
                CACHE["last_updated"] = now
        except: pass
    return CACHE["data"]

def find_dynamic_parents(target_ticker):
    bench_df = get_benchmarks()
    if bench_df is None: return [{"symbol": "SPY", "score": 1.0}] 
    try:
        target_data = yf.download(target_ticker, period="1y", interval="1d", progress=False, auto_adjust=True)
        if target_data.empty: return [{"symbol": "SPY", "score": 1.0}]
        
        combined = bench_df.copy()
        combined[target_ticker] = target_data['Close']
        returns = combined.pct_change().dropna()
        correlations = returns.corr()[target_ticker].drop(target_ticker)
        
        strong_links = correlations[correlations.abs() > 0.25]
        if strong_links.empty: return []
            
        top_links = strong_links.abs().sort_values(ascending=False)
        results = []
        for ticker in top_links.index:
            results.append({"symbol": ticker, "score": correlations[ticker]})
        return results
    except: return [{"symbol": "SPY", "score": 1.0}]

def fetch_stock_stats(ticker):
    try:
        t = yf.Ticker(ticker)
        hist = t.history(period="5d", auto_adjust=True)
        if hist.empty: return None
        curr = hist['Close'].iloc[-1]
        prev = hist['Close'].iloc[-2] if len(hist) > 1 else curr
        curr_vol = hist['Volume'].iloc[-1]
        avg_vol = hist['Volume'].mean()
        try:
            if t.info and 'averageVolume' in t.info: avg_vol = t.info['averageVolume']
        except: pass
        change = ((curr - prev) / prev) * 100
        return { 
            "symbol": ticker, "label": LABEL_MAP.get(ticker, ticker), 
            "price": f"{curr:.2f}", "change": change, "isUp": change > 0, 
            "volume": curr_vol, "avg_volume": avg_vol 
        }
    except: return None

def extract_ticker(raw_input):
    if not raw_input: return "SPY"
    clean = raw_input.strip().upper()
    if "HTTP" in clean or "WWW" in clean:
        match = re.search(r'SYMBOLS?/([A-Z0-9]+)', clean)
        if match: return match.group(1)
        match = re.search(r'QUOTE/([A-Z0-9]+)', clean)
        if match: return match.group(1)
        parts = clean.split('/')
        for p in reversed(parts):
            clean_p = p.split('?')[0]
            if 2 <= len(clean_p) <= 6 and clean_p.isalpha(): return clean_p
        return "SPY"
    clean = re.sub(r'[^A-Z0-9\-]', '', clean)
    return clean if clean else "SPY"

def check_whale(stats):
    v = stats.get('volume', 0)
    a = stats.get('avg_volume', 1) or 1
    ratio = v/a
    def fmt(n):
        if n > 1e6: return f"{n/1e6:.1f}M"
        if n > 1e3: return f"{n/1e3:.1f}K"
        return str(int(n))
    narrative = "Volume is normal."
    if ratio > 1.5:
        narrative = f"Today's volume ({fmt(v)}) is significantly higher than the average ({fmt(a)}), indicating institutional entry."
    elif ratio < 0.5:
        narrative = f"Low liquidity detected ({fmt(v)}). Smart money is inactive."
    return { "is_whale": ratio > 1.5, "ratio": f"{ratio:.1f}x", "vol_str": fmt(v), "avg_str": fmt(a), "narrative": narrative }

def search_ticker(query):
    ticker = extract_ticker(query)
    target = fetch_stock_stats(ticker)
    if not target: target = fetch_stock_stats(f"{ticker}-USD")
    if not target: return {"error": "Not Found"}
    
    whale = check_whale(target)
    nodes = [{ "id": target['symbol'], "type": "stock", "data": { "label": target['label'], "price": target['price'], "change": f"{target['change']:.2f}", "isUp": target['isUp'], "isFocused": True, "whale": whale } }]
    edges = []
    
    parent_data_list = find_dynamic_parents(target['symbol'])
    parents_stats = []
    
    for p_data in parent_data_list:
        p_ticker = p_data['symbol']
        p_score = p_data['score']
        s = fetch_stock_stats(p_ticker)
        if s:
            parents_stats.append(s)
            is_negative_corr = p_score < 0
            edge_color = "#ef4444" if is_negative_corr else "#4ade80"
            edge_style = { "stroke": edge_color, "strokeWidth": 2 }
            if is_negative_corr: edge_style["strokeDasharray"] = "5,5"
            nodes.append({ "id": s['symbol'], "type": "resource", "data": { "label": s['label'], "nodeType": "mover", "price": s['price'], "change": f"{s['change']:.2f}", "isUp": s['isUp'] } })
            edges.append({ "id": f"e-{s['symbol']}-{target['symbol']}", "source": s['symbol'], "target": target['symbol'], "style": edge_style, "animated": True })

    score = 50; boosts = []; drags = []
    if whale['is_whale']:
        if target['isUp']: score += 20; boosts.append("Institutional Buying (+20)")
        else: score -= 20; drags.append("Heavy Selling Volume (-20)")
    
    for p in parents_stats:
        p_name = p['label']
        corr_score = next((item['score'] for item in parent_data_list if item['symbol'] == p['symbol']), 0)
        if corr_score > 0: 
            if target['isUp'] and p['isUp']: score += 15; boosts.append(f"Strong {p_name} (+15)")
            elif target['isUp'] and not p['isUp']: score -= 10; drags.append(f"Weak {p_name} (-10)")
        else: 
            if target['isUp'] and not p['isUp']: score += 10; boosts.append(f"Falling {p_name} (+10)")
            elif target['isUp'] and p['isUp']: score -= 15; drags.append(f"Fighting Rising {p_name} (-15)")

    score = min(95, max(10, score))
    headline = "Neutral Setup"
    if score >= 75: headline = "High Conviction Setup"
    elif score <= 30: headline = "Negative Outlook"
    
    explanation = "No significant drivers."
    parts = []
    if boosts: parts.append(f"Boosted by {', '.join(boosts)}")
    if drags: parts.append(f"Offset by {', '.join(drags)}")
    if parts: explanation = ". ".join(parts) + "."

    return { "nodes": nodes, "edges": edges, "insight": { "status": headline, "message": explanation, "score": score } }

# --- VERCEL ENTRY POINT ---
class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            request_json = json.loads(post_data.decode('utf-8'))
            
            mode = request_json.get('mode', 'BASIC')
            response_data = {}
            
            if mode in ["SEARCH", "CONTEXT"]:
                q = request_json.get("query", "") or request_json.get("url", "")
                intel = search_ticker(q)
                if "error" in intel: response_data = {"error": intel["error"]}
                else: response_data = { "status": "ACTIVE", "ticker": intel['nodes'][0]['data']['label'], "intel": intel }
            elif mode == "RISK":
                try:
                    e = float(request_json.get("entry", 100))
                    c = float(request_json.get("capital", 10000))
                    r = float(request_json.get("risk_pct", 1))
                    s = e * 0.95
                    qty = int((c*(r/100))/(e-s))
                    response_data = {"stop_loss": round(s, 2), "take_profit": round(e*1.1, 2), "shares": qty}
                except: response_data = {}
            else:
                response_data = {"mode": "FULL"}

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(sanitize_for_json(response_data)).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()