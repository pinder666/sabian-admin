import requests
import xml.etree.ElementTree as ET

def fetch_recent_patents():
    url = "https://developer.uspto.gov/ibd-api/v1/application/publications"
    params = {
        "searchText": "*",
        "publicationFromDate": "2024-01-01",
        "publicationToDate": "2024-12-31",
        "rows": 5,
        "start": 0,
        "sortField": "publicationDate",
        "sortOrder": "desc"
    }
    response = requests.get(url, params=params)
    response.raise_for_status()
    data = response.json()

    results = []
    for doc in data.get("response", {}).get("docs", []):
        title = doc.get("title", "No Title")
        abstract = doc.get("abstractText", "No Abstract")
        results.append((title, abstract))

    return results
