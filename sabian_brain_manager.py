# sabian_brain_merger.py — Strategic Synthesis Engine (LOOPED + WIZARD-COMPATIBLE)

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
    # Optionally: call node logger.cjs via subprocess

# === Load Function ===
def load_json(file):
    try:
        with open(file, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return {}

# === Merge Brain Files ===
def merge_brain():
    today = datetime.today().strftime("%Y-%m-%d")
    data_root = os.path.join(data_dir, today)
    out_file = f"sabian_strategic_brain_{today}.json"

    files = [
        "eternal_signal_grid.json",
        "sabian_kpi_targets.json",
        "ai_policy_watch.json"
    ]
    full_brain = {}
    for f in files:
        path = os.path.join(data_root, f)
        key = f.replace(".json", "")
        full_brain[key] = load_json(path)

    out_path = os.path.join(data_root, out_file)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(full_brain, f, indent=2)

    log_to_hive("🧠 Brain merged", {"file": out_file, "source_count": len(files)})

# === Eternal Loop ===
if __name__ == "__main__":
    while True:
        try:
            merge_brain()
        except Exception as e:
            log_to_hive("❌ Merger error", {"error": str(e)})
        time.sleep(15 * 60)  # Run every 15 minutes
