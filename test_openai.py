import openai
import os
from dotenv import load_dotenv

load_dotenv()  # Load variables from .env file

client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

response = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "Say hello from Sabian."}]
)

print(response.choices[0].message.content)
