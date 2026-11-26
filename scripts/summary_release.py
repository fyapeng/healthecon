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

def text_boundaries(path, sections):
    """Compare each extracted section against a second plain-text rendering."""
    with pymupdf.open(path) as doc:
        text="\n".join(page.get_text("text",sort=True) for page in doc)
    letters=[];offset=[]
    for i,c in enumerate(text.lower()):
        if c.isascii() and c.isalpha():letters.append(c);offset.append(i)
    plain="".join(letters)
    headings={"引言":r"introduction|abstract","结论":r"conclu(?:sions?|ding)|discussion","相关研究":r"literature|previous studies|related (?:work|research)"}
    for title,ps in sections:
        value=re.sub("[^a-z]",""," ".join(ps).lower())
        if len(value)<140:return False
        start=plain.find(value[:65]);end=plain.find(value[-65:],max(0,start+65))
        if start<0 or end<0:return False
        stop=end+65
        if not .84<=len(value)/(stop-start)<=1.09:return False
        a=offset[start];b=offset[stop-1]+1
        if not re.search(headings[title],text[max(0,a-440):a],re.I):return False
        # A folio may precede the next heading, but ordinary continuation prose cannot.
        tail=text[b:b+1200].strip(" .:;\t\r\n")
        next_lines=[line.strip() for line in tail.splitlines() if line.strip() and not re.fullmatch(r"\d{1,3}",line.strip())]
        if not next_lines:continue
        if not re.match(r"^(?:(?:[IVX]+|\d+(?:\.\d+)*)[.)]?\s+)?(?:[A-Z][A-Za-z ,:&–-]{1,85}|[A-Z][A-Za-z ,:&–-]{1,65}\.)$",next_lines[0]):return False
    return True

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
        if not verdict_file.is_file() or (json.loads(verdict_file.read_text(encoding="utf8")).get("status")=="章节边界待核" and "boundaryVersion" not in json.loads(verdict_file.read_text(encoding="utf8"))):
            source=(pdf_sections if path.suffix.lower()==".pdf" else xml_sections)(path)
            result=json.loads(summary.read_text(encoding="utf8"))["sections"]
            if len(result)!=len(source) or any(s["name"]!=k or len(s["paragraphs"])!=len(ps) for s,(k,ps) in zip(result,source)):raise ValueError("章节结构需要复核")
            import time
            started=time.monotonic()
            if path.suffix.lower()==".pdf" and not (aligned_pdf(path,source) or text_boundaries(path,source)):status="章节边界待核"
            else:
                pairs=[(en,zh) for s,(_,ps) in zip(result,source) for en,zh in zip(ps,s["paragraphs"])]
                def check(pair):
                    a,b=pair
                    system='Audit the entire Chinese translation against the English. Check all sentences, economic meaning, quantities, units, directions of effects, uncertainty, and author attribution. Reject missing clauses, an invented result, figure-axis or contents-page text, a garbled or truncated passage, or a translated task prompt. Minor stylistic differences are fine. Output only JSON {"pass":true} or {"pass":false}.'
                    return worker.ask(system,"EN: "+a+"\nZH: "+b,80,True).get("pass") is True
                status="通过" if all(list(worker.pool.map(check,pairs))) else "译文待核"
            write(verdict_file,dict(status=status,boundaryVersion=2,seconds=round(time.monotonic()-started,2)))
        if json.loads(verdict_file.read_text(encoding="utf8"))["status"]=="通过":
            year=dest/(str(w["year"])+".json")
            books=json.loads(year.read_text(encoding="utf8")) if year.exists() else {}
            books[w["id"]]={"sections":json.loads(summary.read_text(encoding="utf8"))["sections"]}
            write(year,books);entry["hasSummary"]=True
    if entry:
        idx[w["id"]]=entry;write(dest/"index.json",idx)
