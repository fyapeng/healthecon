"""Local release controls. Re-read real manuscript passages, including deliberately misleading citations."""
import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from corpus_readings import source_units
from study_fulltext import verified_tags,segments,genre
from study_release import catalogue

# Pages refer to the matched local version used for the control. For the external
# controls select evidence by text so replacement by the published edition is safe.
CASES=[
    ("10.3386/w36019","文献综述",{},{"admin":[71,94],"rct":[22,40],"did":[74],"iv":[78,84,94]}),
    ("10.3386/w36059","实证研究",{"admin":[4,9],"did":[26]},{"rct":[7]}),
    ("10.1093/qje/qjaa029","实证研究",{"rct":[],"admin":[]},{}),
    ("10.1257/aer.20170950","理论研究",{"theory":[]},{"rct":[],"admin":[]}),
]
PAT={"theory":"model|mechanism|theorem","admin":"administrative|claims|registry","rct":"randomi[sz]|randomly|trial|RCT",
     "did":"difference.{1,4}in.{1,4}difference|DID","iv":"instrumental|2SLS|instrument"}

def check(vault,repo):
    works=catalogue(vault,repo/"data")
    def run(case):
        doi,kind,yes,no=case
        r=works[doi]
        units,_=source_units(vault/r["file"])
        if re.search(r"Online Appendi(?:x|ces)",units[0][:180],re.I):raise ValueError("对照文件仅为附录")
        parts=segments(units)
        cand={k:[j for j,(n,t) in enumerate(parts,1) if (not pages or n in pages)
                 and re.search(PAT[k],t,re.I)] for k,pages in {**yes,**no}.items()}
        for k in yes:
            if not cand[k]:raise ValueError("对照没有找到证据 "+doi+" "+k)
        opening=" ".join(t for n,t in parts if n<=10)[:14500]
        predicted=genre(r["title"],opening)["kind"]
        returned=verified_tags(r["title"],predicted,parts,cand,opening)
        return {"id":doi,"genre":predicted,"expected_yes":list(yes),"expected_no":list(no),
                "confirmed":{k:r["pages"] for k,r in returned.items()},
                "pass":predicted==kind and all(k in returned for k in yes) and all(k not in returned for k in no)}
    with ThreadPoolExecutor(3) as pool:rows=list(pool.map(run,CASES))
    return rows

if __name__=="__main__":
    import sys
    p=Path(sys.argv[1]).resolve()
    results=check(p,Path(__file__).resolve().parents[1])
    print(json.dumps(results,ensure_ascii=False,indent=2))
    raise SystemExit(not all(x["pass"] for x in results))
