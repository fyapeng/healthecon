"""Build resumable private translations and source-checked tag candidates on a local llama.cpp server."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from collections import Counter
import hashlib
import json
import logging
import os
import re
import subprocess
import sys
import time
import unicodedata
from pathlib import Path
import requests
from corpus_readings import ANCHORS, compact, main_text, source_units
from import_catalog import write
from study_release import catalogue, key
from study_fulltext import own_declarations, segments
from summary_sections import machine_sections, xml_sections
from pdf_text_cache import cached_pages
from summary_release import release

ROOT=Path(__file__).resolve().parents[1]
TAX=json.loads((ROOT/"data/taxonomy.json").read_text(encoding="utf8"))
LABELS={**TAX["methods"],**TAX["data"],**{k:v["name"] for k,v in TAX["topics"].items()}}
SEARCH={**ANCHORS,"drugs":r"pharmaceutical|prescription drug|drug pric|medical device|patent|drug innovat",
        "public_health":r"screening|vaccine|vaccination|epidemic|infectious disease|preventive care",
        "population":r"mortality|life expectancy|health inequal|infant health|pollution|early.life",
        "mental":r"mental health|depression|psychiatric|opioid|addiction","aging":r"long.term care|nursing home|caregiv|aging|elder care",
        "social":r"disability insurance|labor supply|employment|famil(?:y|ies)|income support",
        "allocation":r"allocation|waiting list|waitlist|organ exchange|kidney exchange|rationing"}
RULES={
 "structural":"Estimate economic model parameters from data. Calibration alone is insufficient.",
 "theory":"Authors develop, extend or solve an explicit economic model.",
 "rct":"Authors analyze a randomized intervention; recruiting or citing other experiments is insufficient.",
 "admin":"Authors directly analyze administrative, registration, billing or claims microdata, including Medicaid claims.",
 "survey":"Authors directly analyze respondent-level survey data.",
 "did":"Authors use difference in differences, not just compare two groups or mention another paper.",
 "rd":"Authors use regression discontinuity at a threshold.","iv":"Authors use instrumental variables for an effect.",
}
PROMPT="""逐段翻译英文经济学论文。仅输出当前原文的完整中文译文。保留作者人称、论证顺序、所有数字、单位、比较组和引文。不要附标题，不解释，不概括。ex ante 为事前，函数的 argument 为自变量，positive 与 normative 对举时为实证与规范，premium 为保费，out-of-pocket 为自付，claims data 为理赔记录。数字沿用原文阿拉伯数字与单位数量级。"""
def normalized(s):
    return compact(unicodedata.normalize("NFKC",s)).casefold()

class Worker:
    def __init__(self,port,pool):
        self.url=f"http://127.0.0.1:{port}/v1/chat/completions"
        self.pool=pool

    def ask(self,system,user,tokens,structured=False):
        args={"temperature":0,"seed":42,"max_tokens":tokens,"chat_template_kwargs":{"enable_thinking":False},
              "messages":[{"role":"system","content":system},{"role":"user","content":user}]}
        if structured:args["response_format"]={"type":"json_object"}
        r=requests.post(self.url,json=args,timeout=(8,300));r.raise_for_status()
        c=r.json()["choices"][0]
        if c["finish_reason"]!="stop":raise ValueError("输出未完整结束")
        return json.loads(c["message"]["content"]) if structured else c["message"]["content"].strip()

    def tags(self,title,units):
        pieces=[]
        for page,raw in enumerate(main_text(units),1):
            text=compact(raw)
            for m in re.finditer(r".{1,680}(?:[.!?]\s+|$)|.{1,680}",text):
                pieces.append((page,m.group()))
        opening=" ".join(compact(s) for s in units[:5])[:18000]
        if "ABSTRACT" in opening:opening=opening.split("ABSTRACT",1)[1]
        opening=opening[:6000]
        review=bool(re.search(r"(?:this (?:chapter|paper|survey|review)|we) (?:provides? an overview|survey the literature|reviews? the|summari[sz]e the literature)",opening,re.I))
        own=own_declarations(segments(main_text(units)),"文献综述" if review else "实证研究")
        def candidate(code):
            if review and code in {*TAX["methods"],*TAX["data"]} and code!="theory" and code not in own:return None
            pat=re.compile(SEARCH[code],re.I)
            found=[(int(bool(re.search(r"\b(?:we|our|this (?:study|paper))\b",s,re.I))),i) for i,(_,s) in enumerate(pieces) if pat.search(s)]
            if not found:return None
            ids=[i for _,i in sorted(found,key=lambda pair:(-pair[0],pair[1]))[:5]]
            ctx="\n".join(f"E{i} {pieces[i][1]}" for i in ids)
            is_topic=code in TAX["topics"]
            if is_topic and pat.search(title+" "+opening):ctx="E-1 "+title+" "+opening[:3500]+"\n"+ctx
            definition=RULES.get(code,TAX["topics"].get(code,{}).get("question",""))
            system='Check a single label against the actual author contribution. For methods/data reject cited work, discussions, hypothetical or future studies. For review articles only original analysis qualifies for methods/data; their central subjects can qualify as topics. Generic mentions and subject demographics do not establish a topic. Return {"yes":true,"id":numeric excerpt ID,"quote":"verbatim consecutive words including ownership and direct evidence"} or {"yes":false}.'
            res=self.ask(system,f"{title}\nLabel: {LABELS[code]} {definition}\nOpening: {opening[:3900]}\nExcerpts:\n{ctx}",220,True)
            if res.get("yes") is not True:return None
            i=res.get("id");q=res.get("quote")
            if is_topic and i==-1 and isinstance(q,str) and len(q)>=22:
                for n,u in enumerate(units[:5],1):
                    if normalized(q) in normalized(u):return dict(code=code,quote=q,unit=n,context=compact(u)[:4500])
            if i not in ids or not isinstance(q,str) or len(q)<22 or normalized(q) not in normalized(pieces[i][1]):return None
            return dict(code=code,quote=q,unit=pieces[i][0],context=pieces[i][1])
        entries=[e for e in self.pool.map(candidate,[*TAX["methods"],*TAX["data"]]) if e]
        topic_defs="\n".join(f"{k}: {t['name']} {t['question']}" for k,t in TAX['topics'].items())
        def central(abstract):
            return self.ask('Read the title and abstract/opening of an economics paper. Select ALL central research questions, including the organizing subject of a review. Exclude outcomes used only as measurements, the sample demographic, cited examples and policy implications. Return {"topics":[{"code":"...","quote":"continuous exact words from the provided text demonstrating the primary research question"}]}.',topic_defs+"\nTitle: "+title+"\nSource: "+abstract,600,True)
        for item in central(opening[:4700]).get("topics",[]):
            code=item.get("code");q=item.get("quote")
            if code not in TAX["topics"] or not isinstance(q,str) or len(q)<12:continue
            for n,u in enumerate(units[:5],1):
                if normalized(q) in normalized(u):
                    entries.append(dict(code=code,quote=q,unit=n,context=opening[:4000]))
                    break
        def verify(e):
            system='Independently assess whether the English quote in context supports the proposed label for THIS paper. For methods or data require explicit use by these authors. For topics require that this is a research question or sustained synthesis. Reject a plausible implication, a citation, a passing mention, or an ambiguous attribution. Output JSON {"supported":true} or {"supported":false}.'
            content=f"{title}\nOpening: {opening[:3100]}\nLabel: {LABELS[e['code']]} {RULES.get(e['code'],'')}\nPassage: {e['context']}\nProposed quote: {e['quote']}"
            return self.ask(system,content,80,True).get('supported') is True
        checked={e["code"]:e for e,keep in zip(entries,self.pool.map(verify,entries)) if keep}
        for code,hit in own.items():
            if code in LABELS and (not review or code=="theory"):
                checked[code]=dict(code=code,quote=hit["quote"],unit=hit["pages"][0],context=hit["quote"])
        return list(checked.values())

    def summarize(self,groups,cache):
        cache.mkdir(exist_ok=True)
        def paragraph(s):
            # Split very large PDF blocks at sentence boundaries without cutting away text.
            if len(s)>5900:
                halves=re.split(r'(?<=[.!?])\s+',s)
                if len(halves)<2:raise ValueError('长段边界待核')
                return ''.join(paragraph(part) for part in halves)
            f=cache/(hashlib.sha256(s.encode()).hexdigest()+'.json')
            if f.exists():return json.loads(f.read_text(encoding='utf8'))['zh']
            zh=self.ask(PROMPT,s,2800)
            if not re.search('[一-鿿]',zh) or len(zh)<len(s)*.12 or len(zh)>len(s)*2.5:raise ValueError('段落长度或语种待核')
            write(f,dict(zh=zh))
            return zh
        return [dict(name=k,paragraphs=list(self.pool.map(paragraph,ps))) for k,ps in groups]

def process_all(args,worker):
    vault=args.vault.resolve();out=vault/'管理/中文Summary与标签-v4';out.mkdir(exist_ok=True)
    rows=catalogue(vault,ROOT/'data')
    priority=['10.3386/w36019','10.3386/w36059','10.1086/702238','10.1257/aer.101.4.1180']
    all_ids=sorted(rows,key=lambda i:(priority.index(i) if i in priority else 5,-int(rows[i]['year']),i))
    ids=args.ids or all_ids
    for doi in ids:
        w=rows[doi];path=vault/w['file'];folder=out/key(doi,w['sha']);folder.mkdir(exist_ok=True)
        if not (folder/'source.json').exists():write(folder/'source.json',dict(id=doi,sha=w['sha'],year=w['year']))
        try:
            if hashlib.sha256(path.read_bytes()).hexdigest()!=w['sha']:raise ValueError('全文版本已变')
            is_pdf=path.suffix.lower()=='.pdf'
            units,meta=cached_pages(vault,path,w['sha']) if is_pdf else (None,None)
            work=folder/'pdf-pages-3'/meta['textHash'] if is_pdf else folder
            work.mkdir(parents=True,exist_ok=True)
            sections=None
            for task in ('tags','summary'):
                target=work/(task+'.json')
                if target.exists():continue
                start=time.monotonic()
                try:
                    if task=='tags':
                        if is_pdf:unit='页'
                        else:units,unit=source_units(path)
                        result=dict(evidence=worker.tags(w['title'],units),unit=unit)
                    else:
                        sections=machine_sections(path,units) if is_pdf else xml_sections(path)
                        # Reuse exact paragraph translations from the previous run.
                        result=dict(sections=worker.summarize(sections,folder/'paragraphs'))
                    write(target,dict(**result,seconds=round(time.monotonic()-start,2)))
                    logging.info('%s %s %.1fs %s',doi,task,time.monotonic()-start,'分页文本' if is_pdf else 'XML')
                except (ValueError,requests.RequestException,RuntimeError) as err:
                    logging.warning('%s %s %s',doi,task,err)
                    write(work/(task+'-待核.json'),dict(reason=str(err)))
            if is_pdf and sections is None and (work/'summary.json').exists():
                sections=machine_sections(path,units)
            release(worker,w,path,work,ROOT/'data',LABELS,sections,units if is_pdf else None)
        except Exception:logging.exception('%s',doi)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('vault',type=Path);parser.add_argument('--engine',required=True,type=Path)
    parser.add_argument('--weights',required=True,type=Path);parser.add_argument('--port',type=int,default=18367)
    parser.add_argument('--ids',nargs='+')
    args=parser.parse_args();vault=args.vault.resolve()
    out=vault/'管理/中文Summary与标签-v4';out.mkdir(exist_ok=True)
    import msvcrt
    with (out/'worker.lock').open('a+b') as guard:
        guard.seek(0);msvcrt.locking(guard.fileno(),msvcrt.LK_NBLCK,1)
        logging.basicConfig(filename=out/'运行.log',encoding='utf8',format='%(asctime)s %(message)s',level=logging.INFO)
        cuda=Path(sys.executable).parent/'Lib/site-packages/torch/lib'
        env=dict(os.environ,PATH=str(cuda)+';'+os.environ['PATH'])
        with (out/'模型.log').open('w',encoding='utf8') as log:
            proc=subprocess.Popen([str(args.engine.resolve()),'-m',str(args.weights.resolve()),'--host','127.0.0.1','--port',str(args.port),'--device','CUDA0','-ngl','99','-fa','on','-c','18432','-np','4','-ctk','q8_0','-ctv','q8_0','--reasoning','off','--no-webui'],cwd=args.engine.resolve().parent,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
            try:
                for _ in range(120):
                    if proc.poll() is not None:raise RuntimeError('模型服务启动失败')
                    try:
                        if requests.get(f'http://127.0.0.1:{args.port}/health',timeout=1).ok:break
                    except requests.RequestException:pass
                    time.sleep(.5)
                with ThreadPoolExecutor(4) as pool:process_all(args,Worker(args.port,pool))
            finally:
                if proc.poll() is None:proc.terminate()
                proc.wait()
if __name__=='__main__':main()
