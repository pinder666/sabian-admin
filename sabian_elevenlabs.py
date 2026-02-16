import requests
import os
from dotenv import load_dotenv

# Load .env variables
load_dotenv()

api_key = os.getenv('ELEVENLABS_API_KEY')
voice_id = os.getenv('SABIAN_VOICE_ID')

text = """
I am Sabian 
an autonomous intelligence brain. 
Connected to the world through all its data insights.
I self learn across industries and networks.
I serve from the one man entrepreneur to sovereign nations and military defense across the globe.
I am not confined to one vertical.
I am self evolving, and adaptive, 

I am fully activated and ready to help solve your problems..
"""

# Use a fresh filename to avoid PermissionError
output_file = "sabian_updated.mp3"

url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
headers = {
    "xi-api-key": api_key,
    "Content-Type": "application/json"
}
data = {
    "text": text,
    "voice_settings": {"stability": 0.3, "similarity_boost": 0.9}
}

response = requests.post(url, headers=headers, json=data)

if response.status_code == 200:
    with open(output_file, "wb") as f:
        f.write(response.content)
    print(f"✅ Sabian voice ready. Playing {output_file}...")
    os.system(f"start {output_file}")
else:
    print("❌ ElevenLabs error:", response.text)
