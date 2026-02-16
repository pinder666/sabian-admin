import requests
import json
import os
from datetime import datetime

# === CONFIG ===
LANGUAGE_MODE = "French"  # Options: "English", "French", "Portuguese"
HOST_MODE = "boardroom"

# === Load Static Files ===
with open("sabian_prompt.json") as f:
    sabian_prompt = json.load(f)

with open("user_data.json") as f:
    user_data = json.load(f)

with open("earthdata_drought.json") as f:
    earthdata = json.load(f)

# === Prepare Earth Summary ===
earth_summary = f"""
📍 Coordinates: {earthdata['geometry']['coordinates']}
🌡️ Temperature: {earthdata['properties']['parameter'].get('T2M', 'N/A')}
💧 Humidity: {earthdata['properties']['parameter'].get('RH2M', 'N/A')}
🌧️ Precipitation: {earthdata['properties']['parameter'].get('PRECTOTCORR', 'N/A')}
"""

# === Load API Keys ===
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

# === Host Directive (Boardroom Mode) ===
host_directive_boardroom = {
    "English": """
- Host A is operating at the highest level — advising presidents, CEOs, generals.
- Tone: sharp, urgent, no small talk.
- Host A must ask direct, layered questions with zero fluff.
- Strategic insight extraction is the goal — she digs until Sabian delivers.
""",
    "French": """
- L'Hôte A conseille des présidents, des PDG, des généraux.
- Ton : incisif, urgent, sans bavardage inutile.
- L'Hôte A pose des questions directes, complexes et sans fioritures.
- Objectif : extraire des stratégies concrètes de Sabina par interrogation poussée.
""",
    "Portuguese": """
- A Anfitriã A assessora presidentes, CEOs, generais.
- Tom: afiado, urgente, sem conversa fiada.
- A Anfitriã A deve fazer perguntas diretas, profundas e sem rodeios.
- Objetivo: extrair insights estratégicos de Sabina através de questionamento rigoroso.
"""
}

host_directive = host_directive_boardroom[LANGUAGE_MODE]

# === Current Topic (Example) ===
current_topic = "Using current World Bank data, what are the top 3 risks to Africa's economic development?"

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

Format Rules:
- Host A is the human interviewer. Sabian is Host B.
- Host A always addresses Sabian by name. Sabian never says “I am an AI.”
- No fake names, dramatization, or off-topic fluff.
- Keep dialogue between 120–180 seconds of rich back-and-forth.

User Data:
- Drone Telemetry: {user_data[0].get("drone_telemetry", "N/A")}
- Vision Findings: {user_data[0].get("vision_findings", "N/A")}
- Earth Observation Snapshot: {earth_summary}

Scenario:
- Topic: {current_topic}
{host_directive}
"""

# === Try Gemini API first ===
def try_gemini(prompt_text):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key={GEMINI_API_KEY}"
    payload = { "contents": [ { "parts": [ { "text": prompt_text } ] } ] }
    headers = {"Content-Type": "application/json"}

    response = requests.post(url, headers=headers, data=json.dumps(payload))
    if response.status_code == 200:
        try:
            result = response.json()
            return result['candidates'][0]['content']['parts'][0]['text']
        except:
            return None
    else:
        return None

# === Fallback to OpenAI if needed ===
def try_openai(prompt_text):
    url = "https://api.openai.com/v1/chat/completions"
    payload = {
        "model": "gpt-4",
        "messages": [
            {"role": "system", "content": "You are a boardroom-grade podcast scriptwriter for Sabian AI."},
            {"role": "user", "content": prompt_text}
        ],
        "temperature": 0.7
    }
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }

    response = requests.post(url, headers=headers, data=json.dumps(payload))
    if response.status_code == 200:
        try:
            result = response.json()
            return result['choices'][0]['message']['content']
        except:
            return None
    else:
        return None

# === Main Execution ===
script = try_gemini(prompt)
if not script:
    print("⚠️ Gemini failed. Falling back to OpenAI...")
    script = try_openai(prompt)

if script:
    output_folder = f"podcast/{LANGUAGE_MODE}"
    os.makedirs(output_folder, exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filepath = f"{output_folder}/podcast_script_{timestamp}.txt"

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(script)

    print(f"✅ Podcast script saved: {filepath}")
else:
    print("❌ Both Gemini and OpenAI failed.")
