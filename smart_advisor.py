# sabian_smart_advisor.py — Autonomous Tactical Guidance (LOOPED + HIVE + WIZARD)

import os
import json
import time
from datetime import datetime

# === Setup ===
data_dir = "sabian_eternal_brain"

# === Logger ===
def log_to_hive(event, payload=None):
    print(f"[HIVE LOG] {event}")
    if payload:
        print(json.dumps(payload, indent=2))

# === Load Forecast File ===
def load_forecast():
    today = datetime.today().strftime("%Y-%m-%d")
    path = os.path.join(data_dir, today, f"sabian_forecast_{today}.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return []

# === Generate Tactical Advice ===
def generate_actions(forecast_list):
    actions = []
    for entry in forecast_list:
        kpi = entry.get("kpi", "unknown")
        prediction = entry.get("forecast", "no data")
        actions.append({
            "kpi": kpi,
            "recommended_action": f"Deploy mitigation for {kpi} trajectory. Review operations immediately.",
            "reason": prediction
        })
    return actions

# === Save Actions ===
def save_actions(advice):
    today = datetime.today().strftime("%Y-%m-%d")
    path = os.path.join(data_dir, today, f"sabian_advisor_{today}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(advice, f, indent=2)
    log_to_hive("🧠 Smart Advisor Recommendations Ready", {"count": len(advice)})

# === Loop ===
if __name__ == "__main__":
    while True:
        forecast = load_forecast()
        if forecast:
            actions = generate_actions(forecast)
            save_actions(actions)
        else:
            log_to_hive("⚠️ No forecast found to act on")
        time.sleep(900)  # Loop every 15 minutes
