import os
import json
from datetime import datetime

# === Locate Latest Data Folders ===
base_dir = "data"
fred_dir = os.path.join(base_dir, "fred")
worldbank_dir = os.path.join(base_dir, "worldbank")

latest_date = max(os.listdir(fred_dir))  # assumes folder names are YYYY-MM-DD

# === File Paths ===
fred_path = os.path.join(fred_dir, latest_date, "fedfunds.json")
gdp_path = os.path.join(worldbank_dir, latest_date, "gdp_nigeria.json")

# === Load Data ===
with open(fred_path, "r") as f:
    fed_data = json.load(f)

with open(gdp_path, "r") as f:
    gdp_data = json.load(f)

# === Output Data Paths ===
print("✅ Data loaded:")
print(f"- Fed Data from: {fred_path}")
print(f"- GDP Data from: {gdp_path}")

# === Extract Latest Fed Interest Rate ===
fed_series = fed_data["observations"]
fed_latest = fed_series[-1]  # last entry
fed_value = fed_latest["value"]
fed_date = fed_latest["date"]

# === Extract Latest GDP ===
gdp_series = gdp_data[1]  # data is in the second element
gdp_latest = next(item for item in gdp_series if item["value"] is not None)
gdp_value = gdp_latest["value"]
gdp_year = gdp_latest["date"]

# === Output Clean Summary ===
print("\n🧠 Sabian Economic Snapshot:")
print(f"- Nigeria GDP ({gdp_year}): ${float(gdp_value):,.2f}")
print(f"- Fed Interest Rate ({fed_date}): {fed_value}%")

# === Basic Logic Forecast ===
print("\n📈 Forecast Insight:")

fed_rate = float(fed_value)
gdp_float = float(gdp_value)

if gdp_float > 350_000_000_000 and fed_rate <= 4.5:
    print("✅ Economic climate favorable for growth initiatives.")
elif fed_rate > 4.5 and gdp_float < 360_000_000_000:
    print("⚠️ Caution: Rising interest rates + weak GDP = fragile conditions.")
else:
    print("🌀 Neutral zone — monitor for policy shifts or commodity shocks.")
