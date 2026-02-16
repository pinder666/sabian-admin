# sabian_global_governor.py — World Data Intelligence Engine

import os
import json
import time
from datetime import datetime
import requests
from bs4 import BeautifulSoup

# === Setup ===
today = datetime.today().strftime("%Y-%m-%d")
data_root = os.path.join("sabian_world_brain", today)
os.makedirs(data_root, exist_ok=True)

# === Logger ===
def log_to_hive(event, payload=None):
    print(f"[SABIAN HIVE] {event}")
    if payload:
        print(json.dumps(payload, indent=2))

# === Save JSON ===
def save_json(name, payload):
    path = os.path.join(data_root, name + ".json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

# === Region Data Feeds ===
# === Region Data Feeds — FINAL CORRECTED ===

def scrape_africa():
    payload = {
        "afdb": "https://dataportal.opendataforafrica.org",
        "au": "https://au.int/en",
        "kenya": "https://opendata.go.ke",
        "nigeria": "https://nigerianstat.gov.ng",
        "drc_mines": "https://mines-rdc.cd",
        "sar_bank": "https://www.resbank.co.za"
    }
    save_json("africa_sources", payload)
    log_to_hive("🌍 Africa data mapped", payload)

def scrape_us():
    payload = {
        "sec": "https://www.sec.gov",
        "fred": "https://fred.stlouisfed.org",
        "bea": "https://www.bea.gov",
        "eia": "https://www.eia.gov",
        "yahoo": "https://finance.yahoo.com"
    }
    save_json("us_sources", payload)
    log_to_hive("🇺🇸 US data mapped", payload)

def scrape_uae():
    payload = {
        "fcsa": "https://fcsa.gov.ae",
        "dubai_chamber": "https://www.dubaichamber.com",
        "vision2030": "https://www.vision2030.gov.sa"
    }
    save_json("uae_sources", payload)
    log_to_hive("🇦🇪 UAE/MENA data mapped", payload)

def scrape_asia():
    payload = {
        "india": "https://data.gov.in",
        "china": "http://www.stats.gov.cn/english/",
        "japan": "https://www.meti.go.jp"
    }
    save_json("asia_sources", payload)
    log_to_hive("🌏 Asia-Pacific data mapped", payload)

def scrape_global():
    payload = {
        "world_bank": "https://data.worldbank.org",
        "imf": "https://www.imf.org/en/Data",
        "un": "https://data.un.org",
        "nasa": "https://data.nasa.gov",
        "bis": "https://www.bis.org/statistics/index.htm"
    }
    save_json("global_orgs", payload)
    log_to_hive("🌐 Global organization data mapped", payload)


# === Main Loop ===
if __name__ == "__main__":
    while True:
        try:
            scrape_africa()
            scrape_us()
            scrape_uae()
            scrape_asia()
            scrape_global()
        except Exception as e:
            log_to_hive("💥 Global scrape error", {"error": str(e)})
        time.sleep(900)  # Loop every 15 minutes
