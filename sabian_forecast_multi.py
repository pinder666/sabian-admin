import json
from datetime import datetime

# === Load Unified Brain Snapshot ===
today = datetime.today().strftime("%Y-%m-%d")
brain_path = f"sabian_brain_{today}.json"

with open(brain_path, "r", encoding="utf-8") as f:
    brain = json.load(f)

print(f"\n🌍 Sabian Multi-Country Forecast — {today}\n")

for country, data in brain.items():
    print(f"📍 {country}")
import json
from datetime import datetime

# === Load Unified Brain Snapshot ===
today = datetime.today().strftime("%Y-%m-%d")
brain_path = f"sabian_brain_{today}.json"

with open(brain_path, "r", encoding="utf-8") as f:
    brain = json.load(f)

print(f"\n🌍 Sabian Multi-Country Forecast — {today}\n")

for country, data in brain.items():
    print(f"📍 {country}")

    try:
        pov = float(data.get("poverty_rate", 0))
        lit = float(data.get("literacy_rate", 0))
        aid = float(data.get("aid_pct_gni", 0))
        exp = float(data.get("exports_pct_gdp", 0))
        imp = float(data.get("imports_pct_gdp", 0))

        # === Custom Intelligence Logic
        if pov > 40 and lit < 60:
            print("⚠️ Crisis: High poverty + low literacy = severe human capital gap")

        if aid > 10:
            print("💸 Alert: Heavy aid reliance — risk of external dependency")

        if exp < imp:
            print("📦 Deficit Warning: More imports than exports")

        if lit > 75 and pov < 20:
            print("✅ Strong recovery pattern detected")

    except Exception:
        print("⚠️ Not enough data for full forecast")

    print("—" * 50)

print("\n📈 Forecast Complete.\n")
