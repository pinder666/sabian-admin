import requests
import json
import re
import os
from datetime import datetime

API_KEY = "AIzaSyCpJQNGVrh-gM2edQSV0QQeQukIbQpwmcQ"
url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key={API_KEY}"

# === SET HOST MODE HERE ===
HOST_MODE = "boardroom"  # options: "boardroom", "conversational", "war_room", "enterprise", "sadc_french", "orbit_arabic"

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
current_topic = "Using current World Bank data on poverty, education, and trade in Africa, what are the top 3 risks to economic development, and what strategic moves should regional leaders make now?"
}