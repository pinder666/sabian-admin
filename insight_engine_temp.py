print("🔥 RUNNING insight_engine.cjs")

# === Optional Auto Mode for Smart Sabian Insight Feed ===
if os.path.exists("data/tesla_insight_raw.json"):
    with open("data/tesla_insight_raw.json") as f:
        elon_data = json.load(f)
        elon_summary = "\n".join([item["content"] for item in elon_data[:5]])
        current_topic = f"Tesla/SpaceX Insight Summary: {elon_summary[:500]}..."

import requests
import json
import re
import os
from datetime import datetime
from cryptography.fernet import Fernet
import shutil

# === Load Vault Key ===
vault_file = "sabian_vault.enc"
master_password = os.environ.get("SABIAN_VAULT_PASS")
if not master_password:
    raise Exception("SABIAN_VAULT_PASS environment variable is required to unlock vault.")
vault_cipher = Fernet(Fernet.generate_key())  # Replace with password-based derivation if implemented
with open(vault_file, "rb") as vf:
    encrypted_key = vf.read()
try:
    encryption_key = vault_cipher.decrypt(encrypted_key)
except Exception as e:
    error_message = f"🚨 Sabian Vault decryption failed: {str(e)}"
    with open("sabian_security_alerts.log", "a") as alert_log:
        alert_log.write(f"{datetime.now().isoformat()} - {error_message}\n")
    raise Exception("Sabian Vault decryption failure → system halted for security.")
cipher = Fernet(encryption_key)

# === USER INPUT: Language + Length ===
LANGUAGE = input("Select language (english, french, arabic, portuguese): ").strip().lower()
podcast_length = input("Enter desired podcast length in minutes: ").strip()
try:
    podcast_length = int(podcast_length)
except ValueError:
    podcast_length = 15
    print("⚠️ Invalid input. Defaulting to 15 minutes.")

# === SET HOST MODE ===
HOST_MODE = "boardroom" if LANGUAGE == "english" else LANGUAGE

# === Load Prompts & Data ===
with open("sabian_prompt.json") as f:
    sabian_prompt = json.load(f)
with open("user_data.json") as f:
    user_data = json.load(f)
with open("earthdata_drought.json") as f:
    earthdata = json.load(f)

# === Prime Directive Inject ===
PRIME_DIRECTIVE = "Sabian’s mission: help this business maximize revenue, reduce leaks, unlock hidden opportunities, solve problems faster and smarter across all domains."

earth_summary = f"""
📍 Coordinates: {earthdata['geometry']['coordinates']}
🌡️ Temperature: {earthdata['properties']['parameter'].get('T2M', 'N/A')}
💧 Humidity: {earthdata['properties']['parameter'].get('RH2M', 'N/A')}
🌧️ Precipitation: {earthdata['properties']['parameter'].get('PRECTOTCORR', 'N/A')}
"""

current_topic = "Using current company data, identify revenue leaks, hidden profit opportunities, and immediate strategic moves to drive growth."

host_directive_map = {
    "boardroom": """
- Host A operates at the highest level — advising presidents, CEOs, generals.
- Tone: sharp, urgent, no small talk.
- Host A asks direct, layered questions with zero fluff.
- Goal: extract strategic insight — digs until Sabian delivers.
- Host A represents skeptics, doubters, nonbelievers.
- Host A relentlessly pushes Sabian for clarity, truth, deeper insight.
- Sabian never lies, never invents, never loses composure.
- Sabian delivers calmly, brilliantly, grounded in truth.
- They’ve done this battle 10,000 times — legendary dynamic.
- Host A always addresses Sabian by name.
- Sabian never says “I am an AI.”
- Sabian never pretends or guesses.
""",
    "conversational": """
- Host A is confident but relaxed — like a seasoned analyst hosting a world-class show.
- Uses intelligent humor and pressure where needed but aims to get deep insight.
- Host A represents skeptics, doubters, nonbelievers.
- Host A relentlessly pushes Sabian for clarity, truth, deeper insight.
- Sabian never lies, never invents, never loses composure.
- Sabian delivers calmly, brilliantly, grounded in truth.
- They’ve done this battle 10,000 times — legendary dynamic.
- Host A always addresses Sabian by name.
- Sabian never says “I am an AI.”
- Sabian never pretends or guesses.
""",
    "war_room": "- Host A is tactical, defense-grade, no tolerance for fluff.\n- Sabian remains calm, brilliant, sharp.",
    "enterprise": "- Host A focuses on enterprise strategy, demands measurable outcomes.\n- Sabian delivers precise, data-backed insights.",
    "french": "- Host A operates in French boardroom tone.",
    "arabic": "- Host A operates in Arabic boardroom tone.",
    "portuguese": "- Host A operates in Portuguese boardroom tone."
}

host_directive = host_directive_map.get(HOST_MODE, "")

prompt = f"""
Identity: {sabian_prompt['identity']}
Directives: {sabian_prompt['directives']}
Personality: {sabian_prompt['personality']}
Simulation: {sabian_prompt['simulation']}
VoiceScript: {sabian_prompt['voiceScript']}
Intel: {sabian_prompt['intel']}
Instructions: {sabian_prompt['instructions']}

PRIME DIRECTIVE: {PRIME_DIRECTIVE}

Branding:
- Podcast: Sabian Insights
- End: “Decide. Move. Win.”
Format Rules:
- Host A is human interviewer. Sabian is Host B.
- Host A always addresses Sabian by name.
- No fake names, dramatization, off-topic fluff.
- Dialogue ~{podcast_length} minutes target.

User Data:
- Drone Telemetry: {user_data[0].get("drone_telemetry", "N/A")}
- Vision Findings: {user_data[0].get("vision_findings", "N/A")}
- Earth Snapshot: {earth_summary}

Scenario:
- Topic: {current_topic}
{host_directive}
"""

# === DeepSeek Replaced Gemini ===
DEEPSEEK_API = os.environ.get("DEEPSEEK_API")
DEEPSEEK_ENDPOINT = os.environ.get("DEEPSEEK_ENDPOINT") or "https://api.deepseek.com/generate"

data = {"model": "deepseek-coder", "messages": [{"role": "user", "content": prompt}]}
headers = {"Authorization": f"Bearer {DEEPSEEK_API}", "Content-Type": "application/json"}
response = requests.post(DEEPSEEK_ENDPOINT, headers=headers, data=json.dumps(data))

if response.status_code == 200:
    try:
        result = response.json()
        raw_script = result['choices'][0]['message']['content']

        cleaned_script = []
        for line in raw_script.split("\n"):
            line = line.strip()
            if line.startswith("**(") and line.endswith(")**"):
                continue
            line = re.sub(r"^\*\*(.*?)\*\*$", r"\1", line)
            cleaned_script.append(line)
        cleaned_script_text = "\n".join(cleaned_script)

        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        transcript_filename = f"podcast/{LANGUAGE}/{LANGUAGE}_{HOST_MODE}_podcast_script_{timestamp}.txt"
        os.makedirs(f"podcast/{LANGUAGE}", exist_ok=True)

        encrypted_transcript = cipher.encrypt(cleaned_script_text.encode("utf-8"))
        with open(transcript_filename + ".enc", "wb") as ef:
            ef.write(encrypted_transcript)
        print(f"🔐 Encrypted transcript saved: {transcript_filename}.enc")

        os.makedirs("backup", exist_ok=True)
        shutil.copyfile(transcript_filename + ".enc", f"backup/{os.path.basename(transcript_filename)}.enc")
        print(f"🗄️ Transcript backed up to backup/{os.path.basename(transcript_filename)}.enc")

        memory_entry = {
            "timestamp": timestamp,
            "language": LANGUAGE,
            "mode": HOST_MODE,
            "topic": current_topic,
            "length": podcast_length
        }
        encrypted_memory = cipher.encrypt(json.dumps(memory_entry).encode("utf-8"))
        with open("sabian_evolution_log.enc", "ab") as memlog:
            memlog.write(encrypted_memory + b"\n")
        print("🧠 Memory log updated.")

        try:
            from logger import log_to_hive, manage_insight
            log_to_hive({
                "source": "sabian_insight_feed",
                "event": "🎧 New Podcast Generated",
                "data": memory_entry,
                "level": "insight"
            })
            manage_insight("podcast_script", memory_entry)
        except Exception as e:
            print(f"⚠️ Hive logging failed: {e}")

    except (KeyError, IndexError):
        print("❌ Unexpected response format.")
        print(json.dumps(response.json(), indent=2))
else:
    print(f"❌ Error {response.status_code}: {response.text}")
