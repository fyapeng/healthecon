"""Look up still-missing abstracts by exact DOI; cache completed batches for resumption."""

import argparse
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parents[1]


def harvest(cache):
    cache.mkdir(exist_ok=True, parents=True)
    rows = json.loads((ROOT / "data/papers-index.json").read_text(encoding="utf8"))
    seen = set()
    for path in cache.glob("checked-*.txt"):
        seen.update(path.read_text(encoding="utf8").splitlines())
    ids = sorted(
        w["id"]
        for w in rows
        if not w["hasAbstract"] and w["id"].startswith("10.") and w["id"] not in seen
    )
    batches = [ids[i : i + 25] for i in range(0, len(ids), 25)]
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(lambda batch: fetch_batch(cache, batch), batches))
    print("Completed", len(ids), "DOI lookups")


def fetch_batch(cache, batch):
    client = requests.Session()
    client.mount(
        "https://",
        HTTPAdapter(
            max_retries=Retry(
                total=3, backoff_factor=2, status_forcelist=[429, 500, 502, 503, 504]
            )
        ),
    )
    cachefile = cache / (
        hashlib.sha256("|".join(batch).encode()).hexdigest()[:20] + ".json"
    )
    checkpoint = cache / ("checked-" + cachefile.stem + ".txt")
    if cachefile.exists():
        checkpoint.write_text("\n".join(batch), encoding="utf8")
        return
    # Europe PMC sometimes indexes the manuscript under a different journal ISSN.
    url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
    r = client.get(
        url,
        params={
            "query": " OR ".join(f'DOI:"{s}"' for s in batch),
            "pageSize": 100,
            "resultType": "core",
            "format": "json",
        },
        timeout=55,
    )
    r.raise_for_status()
    found = {}
    for w in r.json()["resultList"]["result"]:
        doi = (w.get("doi") or "").lower()
        if doi in batch and w.get("abstractText"):
            found[doi] = {
                "text": w["abstractText"],
                "source": "Europe PMC",
                "url": "https://europepmc.org/article/" + w["source"] + "/" + w["id"],
            }
    cachefile.write_text(json.dumps(found, ensure_ascii=False), encoding="utf8")
    checkpoint.write_text("\n".join(batch), encoding="utf8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("cache", type=Path)
    harvest(parser.parse_args().cache)
