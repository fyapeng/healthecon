"""Read print-year PubMed listings to fill journal records missing from OpenAlex."""

import argparse
import json
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

JOURNALS = {"0167-6296": "Journal of Health Economics", "1057-9230": "Health Economics"}


def harvest(cache, cutoff):
    cache.mkdir(exist_ok=True, parents=True)
    client = requests.Session()
    client.mount(
        "https://",
        HTTPAdapter(
            max_retries=Retry(
                total=4, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504]
            )
        ),
    )
    for issn, venue in JOURNALS.items():
        file = cache / (issn + "-" + cutoff + ".json")
        if file.exists():
            continue
        cursor = "*"
        out = {}
        while cursor:
            r = client.get(
                "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
                params={
                    "query": f"SRC:MED AND ISSN:{issn} AND PUB_YEAR:[2003 TO {cutoff[:4]}]",
                    "format": "json",
                    "pageSize": 1000,
                    "cursorMark": cursor,
                },
                timeout=80,
            )
            r.raise_for_status()
            j = r.json()
            for w in j["resultList"]["result"]:
                if (
                    not w.get("doi")
                    or not w.get("title")
                    or w.get("firstPublicationDate", "") > cutoff
                ):
                    continue
                doi = w["doi"].lower()
                out[doi] = {
                    "id": doi,
                    "title": w["title"],
                    "authors": w.get("authorString", ""),
                    "year": w["pubYear"],
                    "venue": venue,
                    "pubType": w.get("pubType", ""),
                    "pmid": w["id"],
                }
            curr = j.get("nextCursorMark")
            cursor = curr if curr != cursor else None
        file.write_text(json.dumps(out, ensure_ascii=False), encoding="utf8")
        print(venue, len(out), flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path)
    ap.add_argument("--cutoff", required=True)
    args = ap.parse_args()
    harvest(args.cache, args.cutoff)
