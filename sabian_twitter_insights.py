import os
import requests
import json
from datetime import datetime
from dotenv import load_dotenv

# === Load environment variables ===
load_dotenv()
TWITTER_BEARER_TOKEN = os.getenv("TWITTER_BEARER_TOKEN")

# === Define broad scan topics ===
TOPICS = ["Africa", "Finance", "Government", "World News", "Sports", "Technology", "Conflict", "Healthcare"]
LOG_FILE = "sabian_twitter_log.json"

# === Save scanned tweets to log ===
def save_tweets(topic, tweets):
    timestamp = datetime.utcnow().isoformat()
    entry = {
        "timestamp": timestamp,
        "topic": topic,
        "tweets": tweets
    }
    if os.path.exists(LOG_FILE):
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = []

    data.append(entry)
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

# === Summarize tweets for key insights ===
def summarize_tweets(tweets):
    summary = {
        "total": len(tweets),
        "keywords": []
    }
    all_text = " ".join(tweet["text"].lower() for tweet in tweets)
    common_words = [word for word in all_text.split() if len(word) > 5]
    freq = {}
    for word in common_words:
        freq[word] = freq.get(word, 0) + 1
    sorted_keywords = sorted(freq.items(), key=lambda x: x[1], reverse=True)
    summary["keywords"] = [word for word, count in sorted_keywords[:5]]
    return summary

# === Learning and decision-making hook ===
def sabian_learns(topic, insight):
    # Simulated logic — could store, analyze, or alert in full Sabian system
    print(f"\n🧠 Sabian has logged {insight['total']} tweets on '{topic}'. Key focus: {', '.join(insight['keywords'])}")
    # Future: trigger external decisions or route to models

# === Twitter scan function ===
def scan_topic(topic, max_results=10):
    print(f"\n🔎 Scanning Twitter for: {topic}")
    url = "https://api.twitter.com/2/tweets/search/recent"
    headers = {
        "Authorization": f"Bearer {TWITTER_BEARER_TOKEN}",
        "Content-Type": "application/json"
    }
    params = {
        "query": f"{topic} -is:retweet lang:en",
        "tweet.fields": "author_id,created_at,text",
        "max_results": max_results
    }
    response = requests.get(url, headers=headers, params=params)
    if response.status_code == 200:
        tweets = response.json().get("data", [])
        for tweet in tweets:
            print(f"\n🧠 [{topic}] Tweet by {tweet['author_id']} at {tweet['created_at']}:")
            print(f"{tweet['text']}")
        save_tweets(topic, tweets)
        insight = summarize_tweets(tweets)
        print(f"\n📊 Summary for {topic}: {insight['total']} tweets scanned. Keywords: {', '.join(insight['keywords'])}")
        sabian_learns(topic, insight)
    else:
        print(f"❌ Error scanning {topic}: {response.status_code} - {response.text}")

# === Run the scan ===
if __name__ == "__main__":
    for topic in TOPICS:
        scan_topic(topic)
