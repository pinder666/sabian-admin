import os
import json
import re
from datetime import datetime
import requests
import tempfile
import time
from playsound import playsound

# === Load Voice Profiles ===
with open("tone_profiles.json") as f:
    tone_profiles = json.load(f)

# === USER INPUT ===
language = input("Select language (en, fr, ar, pt): ").strip().lower()
experience_type = input("Enter experience type (e.g. boardroom, ev_sector): ").strip()
business_name = input("Enter business name: ").strip()
business_problem = input("What problem should Sabian solve?: ").strip()

profile = tone_profiles.get(experience_type, {}).get(language)
if not profile:
    print("❌ Invalid experience type or language.")
    exit(1)

voice_prompt = profile["prompt"]
voice_id = profile["voice_id"]

# === Load Prompts & Data ===
with open("sabian_prompt.json") as f:
    sabian_prompt = json.load(f)
with open("user_data.json") as f:
    user_data = json.load(f)
with open("earthdata_drought.json") as f:
    earthdata = json.load(f)

# === Earth Summary Only for Specific Experiences ===
earth_summary = ""
if experience_type in ["smart_city_orbit", "dark_grid", "africa_sadc_growth", "war_room"]:
    earth_summary = f"""
📍 Coordinates: {earthdata['geometry']['coordinates']}
🌡️ Temperature: {earthdata['properties']['parameter'].get('T2M', 'N/A')}
💧 Humidity: {earthdata['properties']['parameter'].get('RH2M', 'N/A')}
🌧️ Precipitation: {earthdata['properties']['parameter'].get('PRECTOTCORR', 'N/A')}
"""

# === Prime Prompt ===
PRIME_DIRECTIVE = "Sabian’s mission: help this business maximize revenue, reduce leaks, unlock hidden opportunities, solve problems faster and smarter across all domains."
current_topic = f"Sabian must help {business_name} solve: {business_problem}"

prompt = f"""
Identity: {sabian_prompt['identity']}
Directives: {sabian_prompt['directives']}
Personality: {sabian_prompt['personality']}
Simulation: {sabian_prompt['simulation']}
VoiceScript: {sabian_prompt['voiceScript']}
Intel: {sabian_prompt['intel']}
Instructions: {sabian_prompt['instructions']}

PRIME DIRECTIVE: {PRIME_DIRECTIVE}

Format:
- Podcast: Sabian Insights
- Host A = human interviewer | Sabian = Host B
- Dialogue style: {voice_prompt}
- Topic: {current_topic}

User Data:
- Drone Telemetry: {user_data[0].get("drone_telemetry", "N/A")}
- Vision Findings: {user_data[0].get("vision_findings", "N/A")}
- Earth Snapshot: {earth_summary}
"""

# === Gemini API Call ===
API_KEY = os.environ.get("GEMINI_API_KEY")
url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key={API_KEY}"
payload = {"contents": [{"parts": [{"text": prompt}]}]}
headers = {"Content-Type": "application/json"}
response = requests.post(url, headers=headers, data=json.dumps(payload))

if response.status_code == 200:
    try:
        result = response.json()
        raw_script = result['candidates'][0]['content']['parts'][0]['text']

        cleaned_script = [re.sub(r"^\*\*(.*?)\*\*$", r"\1", line.strip()) for line in raw_script.split("\n") if not (line.startswith("**(") and line.endswith(")**"))]
        cleaned_script_text = "\n".join(cleaned_script)

        print("\n🎙️ Podcast Script:\n")
        print(cleaned_script_text)

        # === ElevenLabs Voice Generation ===
        ELEVEN_API_KEY = os.environ.get("ELEVENLABS_API_KEY")
        eleven_url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"

        voice_payload = {
            "text": cleaned_script_text,
            "model_id": "eleven_monolingual_v1",
            "voice_settings": {
                "stability": 0.4,
                "similarity_boost": 0.8
            }
        }

        voice_headers = {
            "xi-api-key": ELEVEN_API_KEY,
            "Content-Type": "application/json"
        }

        voice_response = requests.post(eleven_url, headers=voice_headers, json=voice_payload)
        if voice_response.status_code == 200:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
                tmp.write(voice_response.content)
                tmp_path = tmp.name
            print("\n🔊 Playing podcast...")
            playsound(tmp_path)
            time.sleep(1)
        else:
            print(f"❌ ElevenLabs API error: {voice_response.status_code}")
            print(voice_response.text)

    except Exception as e:
        print("❌ Error parsing response:", str(e))
        print(json.dumps(response.json(), indent=2))
else:
    print(f"❌ API Error {response.status_code}: {response.text}")
