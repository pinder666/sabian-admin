import json
from datetime import datetime

# === Load Files ===
today = datetime.today().strftime("%Y-%m-%d")
brain_path = f"sabian_brain_{today}.json"
drought_path = f"drought_risk_{today}.json"

with open(brain_path, "r", encoding="utf-8") as f:
    brain = json.load(f)

with open(drought_path, "r", encoding="utf-8") as f:
    drought = json.load(f)

# === Forecast Logic ===
print(f"\n🌍 Sabian Forecast + Drought — {today}\n")

for country, stats in brain.items():
    print(f"📍 {country}")

    # === Economic Insight ===
    trade_deficit = False
    if stats.get("imports_pct_gdp") and stats.get("exports_pct_gdp"):
        if stats["imports_pct_gdp"] > stats["exports_pct_gdp"]:
            trade_deficit = True

    if trade_deficit:
        print("📦 Deficit Warning: More imports than exports")
    
    if stats.get("aid_pct_gni") and stats["aid_pct_gni"] > 5:
        print("💰 Foreign aid dependency detected")

    # === Drought Insight ===
    drought_level = drought.get(country)
    if drought_level:
        print(drought_level)

    # === Strength Signal ===
    if stats.get("literacy_rate", 0) > 70 and stats.get("poverty_rate", 100) < 30:
        print("✅ Strong recovery pattern detected")

    print("—" * 60)

print("\n📈 Forecast + Drought Review Complete.")
