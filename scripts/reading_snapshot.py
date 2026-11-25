"""Export completed source-matched readings as a consistent point-in-time release."""
import argparse
import json
import sqlite3
from collections import defaultdict
from pathlib import Path
from corpus_readings import CHECK, DATA, MODEL, REV, clean_paragraphs
from fulltext_tags import LABELS
from import_catalog import write
import hashlib

def snapshot(vault, destination):
    works=[w for channel in ("top5","nber","other") for w in
           json.loads((DATA/"index"/(channel+".json")).read_text(encoding="utf8"))]
    conn=sqlite3.connect(vault/"全文目录.sqlite")
    hashes=dict(conn.execute("select id,sha from papers where sha is not null"))
    conn.close()
    directory=vault/"管理"/"健康研究全文导读"
    groups=defaultdict(dict)
    index={}
    for w in works:
        doi=w["id"]; sha=hashes.get(doi)
        if not sha:continue
        f=directory/hashlib.sha256((REV+MODEL+doi+sha).encode()).hexdigest()/(CHECK+".json")
        if not f.exists():continue
        result=json.loads(f.read_text(encoding="utf8"))
        assert (result["id"],result["sha"])==(doi,sha)
        note={k:result[k] for k in ("model","version","unit","basis","paragraphs","sources","tags")}
        note["paragraphs"]=clean_paragraphs(note["paragraphs"])
        if not note["paragraphs"]:continue
        groups[w["year"]][doi]=note
        index[doi]={LABELS[k]:v for k,v in note["tags"].items()}
    destination.mkdir(parents=True,exist_ok=True)
    for year,notes in groups.items():write(destination/(year+".json"),notes)
    for prior in destination.glob("20[0-9][0-9].json"):
        if prior.stem not in groups:write(prior,{})
    write(destination/"index.json",index)
    return len(index)

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("vault",type=Path)
    parser.add_argument("destination",type=Path)
    args=parser.parse_args()
    print(snapshot(args.vault,args.destination))
