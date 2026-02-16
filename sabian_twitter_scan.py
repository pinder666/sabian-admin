import os
import json
import time
import requests
from datetime import datetime
from dotenv import load_dotenv

# === Load environment variables ===
load_dotenv()
TWITTER_BEARER_TOKEN = os.getenv("TWITTER_BEARER_TOKEN")
OPENAI_KEY = os.getenv("OPENAI_KEY")
SCAN_DELAY = int(os.getenv("SABIAN_SCAN_DELAY", 15))

# === Config ===
TOPICS = ["Africa", "Finance", "Government", "World News", "Sports", "Technology", "Conflict", "Healthcare"]
LOG_FILE = "sabian_twitter_log.json"

# === Save to log file ===
def append_to_log(entry):
    if os.path.exists(LOG_FILE):
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = []
    data.append(entry)
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

# === Summarize tweets ===
def summarize_tweets(tweets):
    summary = {"total": len(tweets), "keywords": []}
    all_text = " ".join(tweet["text"].lower() for tweet in tweets)
    words = [w for w in all_text.split() if len(w) > 5]
    freq = {}
    for word in words:
        freq[word] = freq.get(word, 0) + 1
    sorted_keywords = sorted(freq.items(), key=lambda x: x[1], reverse=True)
    summary["keywords"] = [word for word, _ in sorted_keywords[:5]]
    return summary

# === Deep AI analysis ===
def analyze_with_openai(topic, tweets):
    if not OPENAI_KEY:
        return "⚠️ OpenAI key not set."

    text_block = "\n\n".join(tweet["text"] for tweet in tweets[:10])
    prompt = f"""
You are Sabian, an advanced AI analyst. Analyze the following tweets about "{topic}".

Tweets:
{text_block}

Return:
1. Overall sentiment
2. Main trends or recurring themes
3. Anything unusual or urgent
4. Suggested action or follow-up if needed
"""

    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENAI_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "model": "gpt-4",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.5
    }

    res = requests.post(url, headers=headers, json=data)
    if res.status_code == 200:
        return res.json()["choices"][0]["message"]["content"]
    else:
        return f"❌ OpenAI Error: {res.status_code} - {res.text}"

# === Sabian’s decision logic ===
def trigger_decision(topic, summary):
    print(f"\n🧠 Sabian's Decision Trigger for {topic}:")
    if summary["total"] > 15 or "conflict" in summary["keywords"]:
        print("🚨 Pattern detected. Flagging for deeper review.")
    else:
        print("✅ No urgent signal — learning continues.")

# === Twitter scanner ===
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

    r = requests.get(url, headers=headers, params=params)
    if r.status_code == 200:
        tweets = r.json().get("data", [])
        for tweet in tweets:
            print(f"\n🧠 [{topic}] Tweet by {tweet['author_id']} at {tweet['created_at']}:")
            print(tweet["text"])

        summary = summarize_tweets(tweets)
        print(f"\n📊 Summary for {topic}: {summary['total']} tweets. Keywords: {', '.join(summary['keywords'])}")
        trigger_decision(topic, summary)

        ai_response = analyze_with_openai(topic, tweets)
        print(f"\n📣 Sabian Insight:\n{ai_response}")

        entry = {
            "timestamp": datetime.now().isoformat(),
            "topic": topic,
            "summary": summary,
            "tweets": tweets,
            "ai_analysis": ai_response
        }
        append_to_log(entry)
    else:
        print(f"❌ Error scanning {topic}: {r.status_code} - {r.text}")

# === Execute all topics with spacing ===
if __name__ == "__main__":
    for topic in TOPICS:
        scan_topic(topic)
        time.sleep(SCAN_DELAY)
