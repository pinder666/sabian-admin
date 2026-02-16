import argparse
import os
from openai import OpenAI
import requests
from dotenv import load_dotenv

load_dotenv()
client = OpenAI()

NEWS_API_KEY = os.getenv("NEWS_API_KEY")

def fetch_news(query):
    url = f"https://newsapi.org/v2/everything?q={query}&sortBy=publishedAt&apiKey={NEWS_API_KEY}"
    response = requests.get(url)
    if response.status_code != 200:
        return "News fetch failed."
    articles = response.json().get("articles", [])
    summaries = [f"- {a['title']} ({a['source']['name']})" for a in articles[:5]]
    return "\n".join(summaries)

def generate_insight(query, news_data):
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": "You are Sabian, a high-level business and geopolitical intelligence engine. Analyze the following data:"},
            {"role": "user", "content": f"{query}\n\nNews Data:\n{news_data}"}
        ]
    )
    return response.choices[0].message.content

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sabian Hub Intelligence Node")
    parser.add_argument("--query", type=str, required=True, help="Query for business intelligence")
    args = parser.parse_args()

    print(f"\n🔍 Processing query: {args.query}\n")

    news_data = fetch_news(args.query)
    print(news_data + "\n")

    insight = generate_insight(args.query, news_data)
    print("📊 Sabian Insight:\n")
    print(insight)
