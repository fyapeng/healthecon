"""Collect issue-year candidates and separate online-first records for the current-year list."""
import sys,json,time
from pathlib import Path
import requests
venues={"AER":"0002-8282","QJE":"0033-5533","JPE":"0022-3808","REStud":"0034-6527","Econometrica":"0012-9682"}
cache=Path(sys.argv[1]);cache.mkdir(exist_ok=True,parents=True)
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter
session=requests.Session()
session.mount("https://",HTTPAdapter(max_retries=Retry(total=4,backoff_factor=1,status_forcelist=[429,500,502,503,504])))
for j,issn in venues.items():
    if (cache/(j+".json")).exists():continue
    results={}
    for kind in ["print","online"]:
        key=kind+"-pub-date"
        qs={"filter":f"type:journal-article,from-{key}:2026-01-01,until-{key}:2026-11-24","rows":1000,"select":"DOI,title,author,published-print,published-online,abstract,volume,issue"}
        r=session.get(f"https://api.crossref.org/journals/{issn}/works",params=qs,timeout=60);r.raise_for_status()
        data=r.json()["message"]
        assert len(data["items"])==data["total-results"]
        results.update({w["DOI"].lower():w for w in data["items"]})
        time.sleep(1.1)
    (cache/(j+".json")).write_text(json.dumps(results,ensure_ascii=False),encoding="utf8")
    print(j,len(results),flush=True)
