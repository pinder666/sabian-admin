import requests
import json
import re
import os
from datetime import datetime

# === SET HOST MODE HERE ===
HOST_MODE = "boardroom"  # options: "boardroom" or "conversational"

# === Load Prompts & Data ===
with open("sabian_prompt.json") as f:
    sabian_prompt = json.load(f)

with open("user_data.json") as f:
    user_data = json.load(f)

with open("earthdata_drought.json") as f:
    earthdata = json.load(f)

earth_summary = f"""
📍 Coordinates: {earthdata['geometry']['coordinates']}
🌡️ Temperature: {earthdata['properties']['parameter'].get('T2M', 'N/A')}
💧 Humidity: {earthdata['properties']['parameter'].get('RH2M', 'N/A')}
🌧️ Precipitation: {earthdata['properties']['parameter'].get('PRECTOTCORR', 'N/A')}
"""

# === Current Topic ===
current_topic = "Using current World Bank data on poverty, education, and trade in Africa, what are the top 3 risks to economic development, and what strategic moves should regional leaders make now?"

# === Toggle Host Script ===
if HOST_MODE == "boardroom":
    host_directive = """
- Host A is operating at the highest level — advising presidents, CEOs, generals.
- Tone: sharp, urgent, no small talk.
- Host A must ask direct, layered questions with zero fluff.
- Strategic insight extraction is the goal — she digs until Sabian delivers.
- Host A represents the skeptics, doubters, nonbelievers.
- Host A relentlessly pushes Sabian for clarity, truth, deeper insight.
- Sabian never lies, never invents, never loses composure.
- Sabian delivers calmly, brilliantly, and grounded in truth.
- They have done this battle 10,000 times — this is their legendary dynamic.
- Host A always addresses Sabian by name.
- Sabian never says “I am an AI.”
- Sabian never pretends or guesses.
"""
elif HOST_MODE == "conversational":
    host_directive = """
- Host A has a confident but relaxed tone — like a seasoned analyst hosting a world-class show.
- Uses intelligent humor and pressure where needed, but still aims to get deep insight from Sabian.
- Host A represents the skeptics, doubters, nonbelievers.
- Host A relentlessly pushes Sabian for clarity, truth, deeper insight.
- Sabian never lies, never invents, never loses composure.
- Sabian delivers calmly, brilliantly, and grounded in truth.
- They have done this battle 10,000 times — this is their legendary dynamic.
- Host A always addresses Sabian by name.
- Sabian never says “I am an AI.”
- Sabian never pretends or guesses.
"""
else:
    host_directive = ""

# === Build Prompt ===
prompt = f"""
Identity: {sabian_prompt['identity']}
Directives: {sabian_prompt['directives']}
Personality: {sabian_prompt['personality']}
Simulation: {sabian_prompt['simulation']}
VoiceScript: {sabian_prompt['voiceScript']}
Intel: {sabian_prompt['intel']}

Instructions: {sabian_prompt['instructions']}

Branding:
- Podcast is always called "Sabian Insights"
- End each episode with: “Decide. Move. Win.”
- Do NOT use: "Foresight Focus", "Foresight Engine", or "Foresight Drop"

Format Rules:
- Host A is the human interviewer. Sabian is Host B.
- Host A always addresses Sabian by name. Sabian never says “I am an AI.”
- No fake names, dramatization, or off-topic fluff.
- Keep the dialogue between 120–180 seconds of rich back-and-forth.

User Data:
- Drone Telemetry: {user_data[0].get("drone_telemetry", "N/A")}
- Vision Findings: {user_data[0].get("vision_findings", "N/A")}
- Earth Observation Snapshot: {earth_summary}

Scenario:
- Topic: {current_topic}
{host_directive}
"""

# === Call DeepSeek via OpenRouter ===
API_KEY = os.getenv("OPENROUTER_API_KEY")
url = "https://openrouter.ai/api/v1/chat/completions"

payload = {
    "model": "deepseek/deepseek-r1-0528-qwen3-8b",
    "messages": [
        {"role": "system", "content": "You are Sabian, a powerful AI strategist speaking on a podcast."},
        {"role": "user", "content": prompt}
    ]
}
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {API_KEY}"
}

response = requests.post(url, headers=headers, data=json.dumps(payload))


# === Handle Response ===
if response.status_code == 200:
    try:
        result = response.json()
        raw_script = result['candidates'][0]['content']['parts'][0]['text']
        print("\n✅ Gemini Raw Response:\n")
        print(raw_script)

        # === Clean Formatting ===
        cleaned_script = []
        for line in raw_script.split("\n"):
            line = line.strip()
            if line.startswith("**(") and line.endswith(")**"):
                continue
            line = re.sub(r"^\*\*(.*?)\*\*$", r"\1", line)
            cleaned_script.append(line)
        cleaned_script_text = "\n".join(cleaned_script)

        # === Save Output ===
        os.makedirs("podcast", exist_ok=True)
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        filepath = f"podcast/{HOST_MODE}_podcast_script_{timestamp}.txt"

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(cleaned_script_text)

        print(f"\n📁 Cleaned script saved to {filepath}")

    except (KeyError, IndexError):
        print("❌ Unexpected response format.")
        print(json.dumps(response.json(), indent=2))
else:
    print(f"❌ Error {response.status_code}:")
    print(response.text)
