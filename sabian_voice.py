# sabian_voice.py
import requests
import os

ELEVEN_API_KEY = os.getenv("ELEVEN_API_KEY") or "sk_8c648255fc860d5012497a0a72f21b793454765fdb797e90"

VOICE_MAP = {
    "sabian": "pwMBn0SsmN1220Aorv15",            # Male business voice
    "interviewer": "aTxZrSrp47xsP6Ot4Kgd",        # Female interviewer
}

def sabian_speak(text, voice_name="sabian", output="output.mp3"):
    voice_id = VOICE_MAP.get(voice_name)
    if not voice_id:
        print(f"❌ Voice '{voice_name}' not found.")
        return

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": ELEVEN_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "text": text,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    }

    response = requests.post(url, headers=headers, json=payload)
    if response.status_code == 200:
        with open(output, "wb") as f:
            f.write(response.content)
        os.system(f'start {output}')
    else:
        print(f"❌ Failed to synthesize voice: {response.status_code}")
        print(response.text)
