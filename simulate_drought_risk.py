import os
import json
from datetime import datetime

# === Settings ===
today = datetime.today().strftime("%Y-%m-%d")
nasa_dir = os.path.join("data", "nasa", today)
output_path = f"drought_risk_{today}.json"

def assess_risk(data):
    try:
        rain_data = data["properties"]["parameter"]["PRECTOT"]
        values = [float(v) for v in rain_data.values() if v is not None]

        if not values:
            return "⚠️ No Data"
        
        avg = sum(values) / len(values)

        if avg < 1.5:
            return "🔥 High Drought Risk"
        elif avg < 3.0:
            return "⚠️ Moderate Risk"
        else:
            return "✅ Low Risk"

    except KeyError:
        return "❌ PRECTOT Missing"
    except Exception as e:
        return f"❌ Error: {str(e)}"

# === Process Files ===
results = {}

for file in os.listdir(nasa_dir):
    if file.endswith("_climate.json"):
        country = file.replace("_climate.json", "").replace("_", " ").title()
        try:
            with open(os.path.join(nasa_dir, file), "r", encoding="utf-8") as f:
                data = json.load(f)
            results[country] = assess_risk(data)
        except Exception as e:
            results[country] = f"❌ Failed to load: {str(e)}"

# === Save ===
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)

print(f"✅ Simulated drought risk saved to: {output_path}")
