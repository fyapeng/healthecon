"""Fetch publisher-deposited volume and issue identifiers for the JHE catalogue."""

import argparse
import json
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def collect(destination):
    session = requests.Session()
    session.mount("https://", HTTPAdapter(max_retries=Retry(
        total=4, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504]
    )))
    rows = {}
    cursor = "*"
    while True:
        response = session.get(
            "https://api.crossref.org/journals/0167-6296/works",
            params={"cursor": cursor, "rows": 1000, "select": "DOI,volume,issue"},
            timeout=45,
        )
        response.raise_for_status()
        page = response.json()["message"]
        for item in page["items"]:
            if item.get("volume"):
                rows[item["DOI"].lower()] = [item["volume"], item.get("issue", "")]
        if len(page["items"]) < 1000:
            break
        cursor = page["next-cursor"]
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    temporary.replace(destination)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("destination", type=Path)
    collect(parser.parse_args().destination)
