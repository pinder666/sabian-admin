# sabian_scenario_engine.py — Forecast Planner (LOOPED + WIZARD-COMPATIBLE)

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

# === Load Strategic Brain ===
def load_brain():
    today = datetime.today().strftime("%Y-%m-%d")
    file_path = os.path.join(data_dir, today, f"sabian_strategic_brain_{today}.json")
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {}

# === Scenario Generator ===
def generate_forecast(brain):
    forecasts = []
    try:
        if "sabian_kpi_targets" in brain:
            for item in brain["sabian_kpi_targets"].get("priority_metrics", []):
                forecasts.append({
                    "kpi": item,
                    "forecast": f"Sabian predicts shift in {item} within 90 days. Action required."
                })
    except Exception as e:
        log_to_hive("⚠️ Forecast error", {"error": str(e)})
    return forecasts

# === Save Output ===
def save_forecast(data):
    today = datetime.today().strftime("%Y-%m-%d")
    out_path = os.path.join(data_dir, today, f"sabian_forecast_{today}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    log_to_hive("📊 Scenario Forecast Created", {"count": len(data)})

# === Main Loop ===
if __name__ == "__main__":
    while True:
        brain = load_brain()
        if brain:
            forecast = generate_forecast(brain)
            save_forecast(forecast)
        else:
            log_to_hive("⚠️ Strategic brain missing or empty")
        time.sleep(900)  # 15 min loop
