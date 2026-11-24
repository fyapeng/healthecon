"""Build public aggregate data, with distinct denominators for journals and working papers."""
from pathlib import Path
from collections import Counter, defaultdict
import csv, json, re, unicodedata, argparse

ROOT=Path(__file__).resolve().parents[1]
SLUG={"aer":"AER","quarterly-journal-of-economics":"QJE","journal-of-political-economy":"JPE","review-of-economic-studies":"REStud","econometrica":"Econometrica"}
def read(path,sep=","):
    with path.open(encoding="utf-8-sig",newline="") as f:
        yield from csv.DictReader(f,delimiter=sep)
def norm(s):
    s=unicodedata.normalize("NFKD",s).lower()
    return re.sub("[^a-z0-9]","",s)
def save(file,data):
    (ROOT/"data"/file).write_text(json.dumps(data,ensure_ascii=False,separators=(",",":")),encoding="utf8")
def build(src):
    cat=src/"书目"; raw=src/"采集"
    toc=[r for r in read(raw/"卷期目录/articles.csv") if r["journal_slug"] in SLUG and "2020"<=r["year"]<="2024"]
    denom=defaultdict(Counter)
    for r in toc:
        if r["is_research"]=="1":denom[r["year"]][SLUG[r["journal_slug"]]]+=1
    labels={}
    for line in (ROOT/"data/baseline-curation.txt").read_text(encoding="utf-8-sig").strip().splitlines():
        query,topic,region=line.split("|")
        matches=[r for r in toc if norm(query) in norm(r["title"])]
        if len(matches)!=1:
            raise ValueError((query,[r["title"] for r in matches]))
        r=matches[0]
        labels[r["doi"].lower()]={"topic":topic,"region":region,"year":r["year"],"venue":SLUG[r["journal_slug"]],"type":r["article_type"],"set":"历史人工清单","title":r["title"]}
    baseline=len(labels)
    current={k:r for f in (raw/"本年卷期").glob("*.json") for k,r in json.loads(f.read_text(encoding="utf8")).items()}
    for line in (ROOT/"data/current-curation.txt").read_text(encoding="utf-8-sig").strip().splitlines():
        doi,j,topic,reg,question=line.split("|")
        w=current.get(doi)
        if not w: raise ValueError(f"Missing Crossref record: {doi}")
        printed=(w.get("published-print") or {}).get("date-parts", [[]])[0]
        online=(w.get("published-online") or {}).get("date-parts",[[]])[0]
        if printed and printed[0]<2026:continue
        issue=printed and printed[0]==2026 and tuple(printed)<=(2026,11,24)
        labels[doi]={"question":question,"title":re.sub("<[^>]*>","",w["title"][0]),"topic":topic,"region":reg,"year":"2026","venue":j,"set":"本年卷期" if issue else "本年在线","type":"article"}
    dates={r["paper"]:r["issue_date"] for r in read(raw/"NBER批量目录/date.tsv","\t") if re.fullmatch(r"w\d+",r["paper"]) and "2021-01-01"<=r["issue_date"]<="2026-11-24"}
    eh={r["paper"] for r in read(raw/"NBER批量目录/prog.tsv","\t") if r["program"]=="EH"}
    nber=defaultdict(lambda:[0,0])
    for k,date in dates.items():
        nber[date[:4]][0]+=k in eh
        nber[date[:4]][1]+=1
    save("observatory.json",dict(baseline=baseline,labels=labels,denominators=denom,nber=nber,cutoff=max(dates.values())))
    print(baseline,len(labels)-baseline,nber)
if __name__=="__main__":
    ap=argparse.ArgumentParser();ap.add_argument("source",type=Path); build(ap.parse_args().source)
