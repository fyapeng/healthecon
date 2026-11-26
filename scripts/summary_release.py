"""Release a translated section after checking its source boundaries and every translated passage."""
import json
import re
from pathlib import Path
import pymupdf
from import_catalog import write
from summary_sections import INTRO, NUMBER, pdf_sections, xml_sections

SEEDS={"10.1086/702238","10.1257/aer.101.4.1180"}
def aligned_pdf(path,sections):
    # Require an independent boundary signal for automatic release of PDF text.
    # Other PDF layouts can still be translated and independently checked later.
    with pymupdf.open(path) as d:
        heads=[(NUMBER.sub("",title).strip(),n) for level,title,n in d.get_toc() if level==1 and n>0]
        for i,(h,start) in enumerate(heads[:-1]):
            if not INTRO.match(h):continue
            end=heads[i+1][1]
            if not start<end<=len(d):return False
            raw=" ".join(d[n].get_text() for n in range(start-1,end))
            def words(s):return re.findall(r"[a-z]{2,}",s.lower())
            selected=words(" ".join(sections[0][1]))
            observed=words(raw)
            if not selected:return False
            # Last page can contain the next section as well. Bound the comparison
            # by the following heading when it can be located in the end page.
            tail=d[end-1].get_text()
            pos=tail.casefold().find(heads[i+1][0].casefold())
            if pos>=0:observed=words(" ".join(d[n].get_text() for n in range(start-1,end-1))+" "+tail[:pos])
            return len(sections)==1 and .76<=len(selected)/max(1,len(observed))<=1.12
    return False

def release(worker,w,path,folder,site,labels):
    if w["id"] in SEEDS:return
    dest=site/"summaries"
    idx=json.loads((dest/"index.json").read_text(encoding="utf8"))
    entry=idx.get(w["id"],{})
    tags=folder/"tags.json"
    if tags.is_file():
        record=json.loads(tags.read_text(encoding="utf8"))
        entry["tags"]=[labels[e["code"]] for e in record["evidence"]]
    summary=folder/"summary.json"
    if summary.is_file() and not entry.get("hasSummary"):
        verdict_file=folder/"译文核对.json"
        if not verdict_file.is_file():
            source=(pdf_sections if path.suffix.lower()==".pdf" else xml_sections)(path)
            result=json.loads(summary.read_text(encoding="utf8"))["sections"]
            if len(result)!=len(source) or any(s["name"]!=k or len(s["paragraphs"])!=len(ps) for s,(k,ps) in zip(result,source)):raise ValueError("章节结构需要复核")
            import time
            started=time.monotonic()
            if path.suffix.lower()==".pdf" and not aligned_pdf(path,source):status="章节边界待核"
            else:
                pairs=[(en,zh) for s,(_,ps) in zip(result,source) for en,zh in zip(ps,s["paragraphs"])]
                def check(pair):
                    a,b=pair
                    system='Audit the entire Chinese translation against the English. Check all sentences, economic meaning, quantities, units, directions of effects, uncertainty, and author attribution. Reject missing clauses, an invented result, figure-axis or contents-page text, a garbled or truncated passage, or a translated task prompt. Minor stylistic differences are fine. Output only JSON {"pass":true} or {"pass":false}.'
                    return worker.ask(system,"EN: "+a+"\nZH: "+b,80,True).get("pass") is True
                status="通过" if all(list(worker.pool.map(check,pairs))) else "译文待核"
            write(verdict_file,dict(status=status,seconds=round(time.monotonic()-started,2)))
        if json.loads(verdict_file.read_text(encoding="utf8"))["status"]=="通过":
            year=dest/(str(w["year"])+".json")
            books=json.loads(year.read_text(encoding="utf8")) if year.exists() else {}
            books[w["id"]]={"sections":json.loads(summary.read_text(encoding="utf8"))["sections"]}
            write(year,books);entry["hasSummary"]=True
    if entry:
        idx[w["id"]]=entry;write(dest/"index.json",idx)
