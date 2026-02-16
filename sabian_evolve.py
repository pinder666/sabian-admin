import os
import json
import subprocess
from datetime import datetime

# === Constants ===
CORE_DIR = "./sabian_core"
IGNORED_EXTENSIONS = {".json", ".csv", ".log"}
HIVE_LOGGER = "./logger.cjs"
MAX_CHARACTERS = 5000  # per file slice

def log_to_hive(payload):
    try:
        subprocess.run([
            "node", "-e",
            f"require('{HIVE_LOGGER}').logToHive({json.dumps(payload)})"
        ], check=True)
    except Exception as e:
        print(f"⚠️ Failed to log to Hive: {e}")

def read_code_file(filepath):
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        log_to_hive({
            "source": "sabian_evolve",
            "level": "error",
            "event": "Failed to read file",
            "data": {"file": filepath, "error": str(e)},
            "tags": ["read", "failure"]
        })
        return ""

def slice_text(text, chunk_size):
    return [text[i:i + chunk_size] for i in range(0, len(text), chunk_size)]

def review_and_prompt(filepath, content):
    prompt = (
        "You are Sabian. You are improving your own source code.\n"
        "Your mission: Review this file, detect weaknesses, suggest improvements or rewrite blocks if necessary.\n"
        "Context: Sabian is a military-grade synthetic AI composed of autonomous agents, a prediction engine, and healing subsystems.\n\n"
        f"FILE: {filepath}\n"
        "-----\n"
        f"{content}"
    )
    return prompt.strip()

def analyze_files():
    for root, _, files in os.walk(CORE_DIR):
        for file in files:
            ext = os.path.splitext(file)[1]
            if ext in IGNORED_EXTENSIONS:
                continue

            full_path = os.path.join(root, file)
            content = read_code_file(full_path)

            if not content:
                continue

            slices = slice_text(content, MAX_CHARACTERS)
            for index, chunk in enumerate(slices):
                prompt = review_and_prompt(full_path, chunk)

                log_to_hive({
                    "source": "sabian_evolve",
                    "level": "intel",
                    "event": f"Self-review requested on: {file} [chunk {index+1}]",
                    "data": {
                        "file": file,
                        "chunk": index + 1,
                        "prompt": prompt[:300] + "..." if len(prompt) > 300 else prompt
                    },
                    "tags": ["evolve", "review", "self"]
                })

                # You can optionally queue these prompts to OpenAI here

if __name__ == "__main__":
    print("🔍 Sabian Evolution Protocol initializing...")
    analyze_files()
    print("✅ Sabian evolution prompts sent to Hive.")
