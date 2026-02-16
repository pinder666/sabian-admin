import os
import json
from datetime import datetime

# === Get Brain Snapshots ===
brain_files = sorted([f for f in os.listdir() if f.startswith("sabian_brain_") and f.endswith(".json")])

if len(brain_files) < 2:
    print("❌ Not enough brain snapshots to compare.")
    exit()

latest = brain_files[-1]
previous = brain_files[-2]

with open(previous, "r", encoding="utf-8") as f:
    brain_old = json.load(f)

with open(latest, "r", encoding="utf-8") as f:
    brain_new = json.load(f)

# === Compare ===
deltas = {}

for country in brain_new:
    if country not in brain_old:
        deltas[country] = {"status": "new_entry", "data": brain_new[country]}
    else:
        changes = {}
        for key in brain_new[country]:
            old_val = brain_old[country].get(key)
            new_val = brain_new[country].get(key)
            if old_val != new_val:
                changes[key] = {"old": old_val, "new": new_val}
        if changes:
            deltas[country] = {"status": "updated", "changes": changes}

# === Save Deltas ===
today = datetime.today().strftime("%Y-%m-%d")
filename = f"sabian_deltas_{today}.json"

with open(filename, "w", encoding="utf-8") as f:
    json.dump(deltas, f, indent=2)

print(f"✅ Delta file saved as {filename}")
