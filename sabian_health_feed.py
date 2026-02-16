import requests
import time
import xml.etree.ElementTree as ET
import json

# Constants
CHECK_INTERVAL = 86400  # Once per day


def pull_openfda():
    url = "https://api.fda.gov/drug/label.json?search=aspirin&limit=1"
    try:
        response = requests.get(url)
        if response.ok:
            data = response.json()
            return {"source": "OpenFDA", "description": data['results'][0].get('description', ["No description"])[0]}
    except Exception as e:
        return {"source": "OpenFDA", "error": str(e)}


def pull_dailymed():
    url = "https://dailymed.nlm.nih.gov/dailymed/rss.cfm"
    try:
        response = requests.get(url)
        root = ET.fromstring(response.content)
        first_item = root.find('./channel/item/title')
        return {"source": "DailyMed", "latest_drug": first_item.text if first_item is not None else "No data"}
    except Exception as e:
        return {"source": "DailyMed", "error": str(e)}


def pull_cdc_covid():
    url = "https://data.cdc.gov/resource/9mfq-cb36.json?$limit=1"
    try:
        response = requests.get(url)
        if response.ok:
            data = response.json()
            return {"source": "CDC", "cases": data[0].get("new_case", "N/A"), "state": data[0].get("state", "Unknown")}
    except Exception as e:
        return {"source": "CDC", "error": str(e)}


def pull_who_stats():
    url = "https://ghoapi.azureedge.net/api/WHOSIS_000001"
    try:
        response = requests.get(url)
        if response.ok:
            data = response.json()
            entry = data.get("value", [{}])[0]
            return {"source": "WHO", "indicator": entry.get("IndicatorName", "N/A"), "value": entry.get("Value", "N/A")}
    except Exception as e:
        return {"source": "WHO", "error": str(e)}


def pull_fema_disasters():
    url = "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$top=1&$orderby=declarationDate desc"
    try:
        response = requests.get(url)
        if response.ok:
            data = response.json()
            latest = data.get("DisasterDeclarationsSummaries", [])[0]
            return {
                "source": "FEMA",
                "disaster_type": latest.get("incidentType", "N/A"),
                "state": latest.get("state", "N/A"),
                "date": latest.get("declarationDate", "N/A")
            }
    except Exception as e:
        return {"source": "FEMA", "error": str(e)}


def run_sabian_health_loop():
    while True:
        print("\n[Sabian Health Feed] Running data fetch...")
        results = [
            pull_openfda(),
            pull_dailymed(),
            pull_cdc_covid(),
            pull_who_stats(),
            pull_fema_disasters()
        ]

        with open("sabian_health_feed_log.json", "a") as f:
            f.write(json.dumps(results, indent=2) + "\n")

        print("[✓] Data saved. Next run in 24 hours.")
        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    run_sabian_health_loop()
