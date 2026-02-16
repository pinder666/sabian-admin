import tweepy
import os

# === Twitter Auth ===
api_key = "YOUR_API_KEY"
api_secret = "YOUR_API_SECRET"
access_token = "YOUR_ACCESS_TOKEN"
access_token_secret = "YOUR_ACCESS_SECRET"

auth = tweepy.OAuth1UserHandler(api_key, api_secret, access_token, access_token_secret)
api = tweepy.API(auth)

# === Tweet Content ===
caption = "🧠 Sabian’s Reflection: Strategic intelligence from the edge.\n#Sabian #AI #Foresight #Geopolitics"

audio_path = "sabian_thoughts_2025-04-22_22-15-01.mp3"  # latest mp3

# === Post to Twitter ===
media = api.media_upload(audio_path)
api.update_status(status=caption, media_ids=[media.media_id])
print("✅ Reflection posted to Twitter.")
