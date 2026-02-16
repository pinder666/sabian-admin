import pandas as pd
from datetime import datetime
import subprocess
import json

# Load CSV
df = pd.read_csv("Generation Dates-Grid view.csv")

# Clean & preprocess
df.columns = [col.strip() for col in df.columns]
print("📊 Columns:", df.columns.tolist())

def log_to_hive(payload):
    try:
        subprocess.run([
            "node", "-e",
            f"require('./logger.cjs').logToHive({json.dumps(payload)})"
        ], check=True)
    except Exception as e:
        print(f"⚠️ Failed to log to Hive: {e}")

# Generate insights
def generate_insights(data):
    insights = []
    if "Date" in data.columns:
        data['Date'] = pd.to_datetime(data['Date'], errors='coerce')
        data = data.sort_values(by='Date')
        start_date = data['Date'].min().strftime("%B %d, %Y")
        end_date = data['Date'].max().strftime("%B %d, %Y")
        insights.append(f"Our data spans from {start_date} to {end_date}.")
    if "Metric" in data.columns:
        avg_value = data["Metric"].mean()
        insights.append(f"The average recorded metric is {avg_value:.2f} units.")
    return insights

# Generate podcast script
def create_podcast_script(insights):
    script = []
    for i, insight in enumerate(insights):
        script.append({
            "speaker": "Interviewer",
            "text": f"Sabian, what can you tell us about insight #{i+1}?"
        })
        script.append({
            "speaker": "Sabian",
            "text": insight
        })
    return script

# Run generation
insights = generate_insights(df)
script = create_podcast_script(insights)

log_to_hive({
    "source": "sabian_podcast",
    "level": "intel",
    "event": "Podcast script generated",
    "data": {
        "insights": insights,
        "script_preview": script[:2]
    },
    "tags": ["podcast", "insight", "voice"]
})

for line in script:
    print(f"\n🎙️ {line['speaker']}: {line['text']}")

from podcast_voicebox import generate_audio
generate_audio(script)
