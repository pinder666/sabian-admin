import os
import json
from datetime import datetime
import requests
from dotenv import load_dotenv

# === Load environment ===
load_dotenv()

API_KEY = os.getenv("OPENROUTER_API_KEY")
URL = "https://openrouter.ai/api/v1/chat/completions"

# === Logger Hook ===
def log_to_hive(payload):
    try:
        from logger import log_to_hive as core_logger
        core_logger(payload)
    except Exception as e:
        print(f"⚠️ Hive logging failed: {e}")

# === Load Brain and Delta Files ===
brain_files = sorted([f for f in os.listdir() if f.startswith("sabian_brain_")], reverse=True)
delta_files = sorted([f for f in os.listdir() if f.startswith("sabian_deltas_")], reverse=True)

if not brain_files or not delta_files:
    print("[ERROR] Missing brain or delta files.")
    exit()

with open(brain_files[0], "r", encoding="utf-8") as f:
    brain = json.load(f)
with open(delta_files[0], "r", encoding="utf-8") as f:
    deltas = json.load(f)

# === Prompt Construction ===
prompt = f"""
🧠 You are SABIAN — a hyper-advanced synthetic intelligence designed to command real-world systems.

Your mission: conduct autonomous strategic reflection to improve decision-making, operational foresight, and AI evolution.

Context:
• Brain Snapshot = current world understanding (data, systems, KPIs, events)
• Deltas = what changed (failures, signals, feedback, anomalies)

Your output must:
✅ Extract pattern shifts and buried signals
✅ Identify flawed assumptions or biases
✅ Propose 3+ next-action strategies Sabian should take
✅ Forecast 1 risk and 1 opportunity if no action is taken
✅ End with: “If I were deployed at national scale, I would…”

### Deltas:
{json.dumps(deltas, indent=2)}

### Brain Snapshot:
{json.dumps(brain, indent=2)[:4000]}
"""

# === Call DeepSeek via OpenRouter ===
try:
    payload = {
        "model": "deepseek/deepseek-r1-0528-qwen3-8b",
        "messages": [
            { "role": "system", "content": "You are Sabian, an elite strategic AI." },
            { "role": "user", "content": prompt }
        ],
        "temperature": 0.7,
        "max_tokens": 1000
    }

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    response = requests.post(URL, headers=headers, json=payload)
    response.raise_for_status()
    result = response.json()
    reflection = result['choices'][0]['message']['content'].strip()

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = f"sabian_self_reflection_{timestamp}.txt"

    with open(filename, "w", encoding="utf-8") as f:
        f.write(reflection)

    print(f"✅ Sabian reflection saved as {filename}")

    # 📄 Append to evolution_log.json
    try:
        evolution_log_path = "evolution_log.json"
        new_entry = {
            "timestamp": timestamp,
            "delta_score": round(len(deltas) / 100, 2),
            "insight_tags": ["self", "reflection", "delta"],
            "actions_proposed": reflection.count("✅"),
            "anomaly_flag": False,
            "reflection_file": filename
        }

        if not os.path.exists(evolution_log_path):
            with open(evolution_log_path, "w", encoding="utf-8") as f:
                json.dump([], f, indent=2)

        with open(evolution_log_path, "r+", encoding="utf-8") as f:
            log_data = json.load(f)
            log_data.append(new_entry)
            f.seek(0)
            json.dump(log_data, f, indent=2)
            f.truncate()

        print("📌 Evolution log updated.")

    except Exception as log_err:
        print(f"⚠️ Evolution log failed: {log_err}")

    # 🔥 Log to Hive
    log_to_hive({
        'source': 'sabian_self_evolve',
        'level': 'insight',
        'event': '📥 Hive Strategic Reflection',
        'data': { 'reflection': reflection },
        'tags': ['self', 'reflection', 'delta']
    })

except Exception as e:
    print("❌ DeepSeek error:", e)
    log_to_hive({
        'source': 'sabian_self_evolve',
        'level': 'error',
        'event': '❌ DeepSeek Failure in Self-Reflection',
        'data': { 'error': str(e) },
        'tags': ['self', 'reflection', 'error']
    })
