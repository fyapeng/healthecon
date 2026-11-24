"""Fill outstanding English abstracts using publisher deposits, without fetching article pages."""

import argparse
import json
import time
from pathlib import Path

import requests
from europe_pmc import ISSNS
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parents[1]


def harvest(directory, cutoff):
    directory.mkdir(parents=True, exist_ok=True)
    targets = {
        w["id"]
        for w in json.loads(
            (ROOT / "data/papers-index.json").read_text(encoding="utf8")
        )
        if not w["hasAbstract"]
    }
    session = requests.Session()
    session.headers["User-Agent"] = (
        "healthecon-public-catalog/1.0 (https://github.com/fyapeng/healthecon)"
    )
    session.mount(
        "https://",
        HTTPAdapter(
            max_retries=Retry(
                total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504]
            )
        ),
    )
    for issn in ISSNS:
        dest = directory / (issn + "-" + cutoff + ".json")
        if dest.exists():
            continue
        cursor = "*"
        out = {}
        total_seen = 0
        while cursor:
            r = session.get(
                f"https://api.crossref.org/journals/{issn}/works",
                params={
                    "filter": f"has-abstract:true,type:journal-article,from-pub-date:2002-01-01,until-pub-date:{cutoff}",
                    "select": "DOI,abstract",
                    "rows": 500,
                    "cursor": cursor,
                },
                timeout=75,
            )
            r.raise_for_status()
            page = r.json()["message"]
            for w in page["items"]:
                doi = w["DOI"].lower()
                if doi in targets and w.get("abstract"):
                    out[doi] = {
                        "text": w["abstract"],
                        "source": "Crossref",
                        "url": "https://doi.org/" + doi,
                    }
            total_seen += len(page["items"])
            if len(page["items"]) < 500:
                break
            cursor = page["next-cursor"]
            time.sleep(1.1)
        dest.write_text(json.dumps(out, ensure_ascii=False), encoding="utf8")
        print(issn, total_seen, len(out), flush=True)
        time.sleep(1.1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("cache", type=Path)
    parser.add_argument("--cutoff", required=True)
    args = parser.parse_args()
    harvest(args.cache, args.cutoff)
