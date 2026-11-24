"""Collect OpenAlex-listed open copies of catalogued JHE and curated Top Five papers."""
import argparse
import json
import os
import time
from pathlib import Path
from urllib.parse import urlsplit

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("cache", type=Path)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    records = json.loads((ROOT / "data/catalog.json").read_text(encoding="utf-8"))
    curated = json.loads((ROOT / "data/observatory.json").read_text(encoding="utf-8"))["labels"]
    dois = sorted(set(curated) | {w["id"] for w in records if w["venue"] == "Journal of Health Economics" and w["id"].startswith("10.")})
    session = requests.Session()
    session.mount("https://", HTTPAdapter(max_retries=Retry(total=3, backoff_factor=1, status_forcelist=[429, 502, 503, 504])))
    result = {}
    for start in range(0, len(dois), 40):
        batch = dois[start:start + 40]
        path = args.cache / (str(start) + ".json")
        cached = json.loads(path.read_text(encoding="utf8")) if path.exists() else {}
        if cached.get("dois") != batch:
            params = {"filter": "doi:" + "|".join(batch), "select": "doi,best_oa_location", "per_page": len(batch)}
            if os.environ.get("OPENALEX_API_KEY"):
                params["api_key"] = os.environ["OPENALEX_API_KEY"]
            r = session.get("https://api.openalex.org/works", params=params, timeout=35)
            if not r.ok:
                raise RuntimeError(f"OpenAlex returned {r.status_code}")
            cached = {"dois": batch, "works": r.json()["results"]}
            path.write_text(json.dumps(cached), encoding="utf8")
            time.sleep(0.3)
        for work in cached["works"]:
            loc = work.get("best_oa_location") or {}
            if not loc.get("is_oa"):
                continue
            url = loc.get("pdf_url") or loc.get("landing_page_url") or ""
            if urlsplit(url).scheme == "https":
                result[work["doi"].removeprefix("https://doi.org/").lower()] = url
    (ROOT / "data/open-copies.json").write_text(json.dumps(result, ensure_ascii=False, sort_keys=True), encoding="utf8")
    print(len(result), "open locations for", len(dois), "DOIs")


if __name__ == "__main__":
    main()
