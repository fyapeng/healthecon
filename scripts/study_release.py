"""Publish only independently readable, source-matched long studies and their own evidence."""
import hashlib
import json
import sqlite3
from pathlib import Path
from collections import defaultdict
from fulltext_tags import LABELS
from import_catalog import write
FORMAT="long-study-attribution-2"

def key(doi,sha):
    return hashlib.sha256((doi+sha).encode()).hexdigest()

def current_note(f,doi,sha):
    if not f.exists():return False
    record=json.loads(f.read_text(encoding="utf8"))
    return (record.get("id"),record.get("sha"))==(doi,sha) and (
        record.get("pipelineVersion")==FORMAT or record.get("credit")=="据全文整理，已逐段核对")

def catalogue(vault,data):
    registry={w["id"]:w for group in ("top5","nber","other")
              for w in json.loads((data/"index"/(group+".json")).read_text(encoding="utf8"))}
    with sqlite3.connect(vault/"全文目录.sqlite") as conn:
        conn.row_factory=sqlite3.Row
        return {r["id"]:{**registry[r["id"]],**dict(r)} for r in
                conn.execute("select id,title,sha,file,version from papers where file is not null and sha is not null and version!='relatedManuscript'") if r["id"] in registry}

def snapshot(vault,data,dest):
    registry=catalogue(vault,data)
    groups=defaultdict(dict)
    idx={}
    for i,w in registry.items():
        f=vault/"管理"/"文章长总结"/(key(i,w["sha"])+".json")
        if not current_note(f,i,w["sha"]):continue
        note=json.loads(f.read_text(encoding="utf8"))
        assert (note["id"],note["sha"])==(i,w["sha"])
        assert set(note["tagEvidence"])<=set(LABELS.values())
        assert len(note["paragraphs"])>=4 and sum(len(p["text"]) for p in note["paragraphs"])>=850
        for field in [*note["paragraphs"],*note["tagEvidence"].values()]:
            assert field["pages"] and all(isinstance(n,int) and n>0 for n in field["pages"])
        groups[w["year"]][i]={k:note[k] for k in ("kind","version","unit","credit","paragraphs","tagEvidence")}
        idx[i]={label:v["pages"] for label,v in note["tagEvidence"].items()}
    dest.mkdir(parents=True,exist_ok=True)
    for year in groups.keys()|{f.stem for f in dest.glob("20??.json")}:write(dest/(year+".json"),groups[year])
    write(dest/"index.json",idx)
    return len(idx)
