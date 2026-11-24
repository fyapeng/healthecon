"""Cache public abstracts from Europe PMC by journal ISSN and first publication date."""

import argparse
import json
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ISSNS = [
    "0167-6296",
    "1057-9230",
    "0002-8282",
    "0033-5533",
    "0022-3808",
    "0034-6527",
    "0012-9682",
]


def harvest(directory, cutoff):
    directory.mkdir(exist_ok=True, parents=True)
    session = requests.Session()
    session.mount(
        "https://",
        HTTPAdapter(
            max_retries=Retry(
                total=4, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504]
            )
        ),
    )
    for issn in ISSNS:
        path = directory / f"{issn}-{cutoff}.json"
        if path.exists():
            continue
        cursor = "*"
        records = {}
        while cursor:
            response = session.get(
                "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
                params={
                    "query": f"ISSN:{issn} AND FIRST_PDATE:[2002-01-01 TO {cutoff}]",
                    "cursorMark": cursor,
                    "pageSize": 250,
                    "resultType": "core",
                    "format": "json",
                },
                timeout=100,
            )
            response.raise_for_status()
            data = response.json()
            for item in data["resultList"]["result"]:
                if item.get("doi") and item.get("abstractText"):
                    records[item["doi"].lower()] = {
                        "text": item["abstractText"],
                        "source": "Europe PMC",
                        "url": "https://europepmc.org/article/"
                        + item["source"]
                        + "/"
                        + item["id"],
                    }
            next_cursor = data.get("nextCursorMark")
            if next_cursor == cursor:
                break
            cursor = next_cursor
        path.write_text(json.dumps(records, ensure_ascii=False), encoding="utf8")
        print(issn, len(records), flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path)
    ap.add_argument("--cutoff", required=True)
    args = ap.parse_args()
    harvest(args.cache, args.cutoff)
