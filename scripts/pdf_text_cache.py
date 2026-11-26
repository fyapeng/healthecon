"""Private page-preserving PDF text cache: Poppler reading order, page-level fallbacks."""
import argparse
import hashlib
import json
import os
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import unicodedata

import pymupdf

REV = "poppler-pages-1"
def score(text):
    words=re.findall(r"[A-Za-z]+",text)
    common=len(re.findall(r"\b(?:the|of|in|and|to|from|for|with|is|was|were|our|we)\b",text,re.I))
    corrupt=text.count("\ufffd")+sum(len(w) for w in words if len(w)>33)
    return common,min(1,corrupt/max(1,len(text)))

def clean(text):
    return unicodedata.normalize("NFKC",text).replace("\u00ad","").replace("\r\n","\n").strip()

def run_text(cmd,**kw):
    return subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=120,check=True,creationflags=subprocess.CREATE_NO_WINDOW,**kw).stdout.decode("utf8")

CONTROL = re.compile(r"[\x7f-\x9f\ufffd]")
def repair_ligatures(text,ocr):
    """Use the rendered page as evidence; preserve the PDF's original column order."""
    words=set(re.findall(r"[A-Za-z]+",ocr.casefold()))
    pattern=re.compile(r"([A-Za-z]*)([ ]?)([\x80-\x9f])[ ]?([a-z]+)")
    def repair(m):
        a,space,_,b=m.groups()
        if len(a+b)<2:return m[0]
        matches=[a+x+b for x in ("fi","fl","ff","ffi","ffl") if (a+x+b).casefold() in words]
        if len(matches)==1:return matches[0]
        if space and len(b)>=2:
            suffix=[x+b for x in ("fi","fl","ff","ffi","ffl") if (x+b).casefold() in words]
            if len(suffix)==1:return a+space+suffix[0]
        return m[0]
    return pattern.sub(repair,text)

def recognize(page):
    engine=shutil.which('tesseract') or r'C:/Program Files/Tesseract-OCR/tesseract.exe'
    if not Path(engine).is_file():return ""
    pix=page.get_pixmap(dpi=220,alpha=False)
    return clean(run_text([engine,"stdin","stdout","-l","eng"],input=pix.tobytes("png"),env=dict(os.environ,OMP_THREAD_LIMIT='1')))

def get_pages(pdf):
    exe=shutil.which("pdftotext")
    if not exe:raise FileNotFoundError("pdftotext")
    raw=run_text([exe,"-enc","UTF-8","-eol","unix",str(pdf),"-"])
    pages=raw.split("\f")
    if pages and not pages[-1].strip():pages.pop()
    methods=[];issues=[]
    with pymupdf.open(pdf) as doc:
        if len(pages)!=len(doc):
            # Blank pages and embedded form feeds can confuse whole-document splitting.
            # Request physical pages individually, so every evidence location stays valid.
            pages=[run_text([exe,"-f",str(n),"-l",str(n),"-enc","UTF-8","-eol","unix","-nopgbrk",str(pdf),"-"]).replace("\f","\n") for n in range(1,len(doc)+1)]
        for i,raw in enumerate(pages):
            text=clean(raw);method="Poppler";n,bad=score(text)
            if n<4 or bad>.03:
                page=doc[i];other=clean(page.get_text(sort=True));on,ob=score(other)
                if on>=4 and (n<4 or ob<bad*.5):
                    text,method,n,bad=other,"PyMuPDF",on,ob
                if (n<4 or bad>.03) and page.get_image_info() and (len(text)<200 or bad>.03):
                    engine=shutil.which('tesseract') or r'C:/Program Files/Tesseract-OCR/tesseract.exe'
                    if Path(engine).is_file():
                        pix=page.get_pixmap(dpi=220,alpha=False)
                        env=dict(os.environ,OMP_THREAD_LIMIT='1')
                        try:alt=clean(run_text([engine,"stdin","stdout","-l","eng"],input=pix.tobytes("png"),env=env))
                        except (subprocess.SubprocessError,UnicodeError):alt=""
                        an,ab=score(alt)
                        if an>=max(4,n+2) and ab<.03:text,method,n,bad=alt,'Tesseract',an,ab
                if (bad>.03 or (not text and page.get_image_info())):issues.append(i+1)
            if CONTROL.search(text):
                try:alt=recognize(doc[i])
                except (subprocess.SubprocessError,UnicodeError):alt=""
                fixed=repair_ligatures(text,alt)
                if fixed!=text:text,method=fixed,method+"+字形核对"
                if CONTROL.search(text) and i+1 not in issues:issues.append(i+1)
            pages[i]=text;methods.append(method)
    return pages,methods,issues

def paths(vault,sha):
    base=vault/'机器可读全文'/REV/sha[:2]
    return base/(sha+'.txt'),base/(sha+'.json')

def cached_pages(vault,pdf,sha):
    txt,meta=paths(vault,sha)
    if meta.exists() and txt.exists():
        raw=txt.read_text(encoding='utf8');m=json.loads(meta.read_text(encoding='utf8'))
        if m.get('glyphCheck')==2 and m['sha256']==sha and hashlib.sha256(raw.encode()).hexdigest()==m['textHash']:
            return raw.split('\f'),m
        if m['sha256']==sha and not CONTROL.search(raw) and hashlib.sha256(raw.encode()).hexdigest()==m['textHash']:
            return raw.split('\f'),m
    if hashlib.sha256(pdf.read_bytes()).hexdigest()!=sha:raise ValueError("PDF 指纹不匹配")
    pages,methods,issues=get_pages(pdf);text='\f'.join(pages)
    m=dict(glyphCheck=2,sha256=sha,textHash=hashlib.sha256(text.encode()).hexdigest(),pages=len(pages),methods=dict(Counter(methods)),
           fallbackPages={str(i):s for i,s in enumerate(methods,1) if s!='Poppler'},checkPages=issues)
    txt.parent.mkdir(parents=True,exist_ok=True)
    for path,content in [(txt,text),(meta,json.dumps(m,ensure_ascii=False))]:
        with tempfile.NamedTemporaryFile(mode='w',encoding='utf8',newline='',dir=path.parent,delete=False) as tmp:tmp.write(content)
        Path(tmp.name).replace(path)
    return pages,m

def main():
    from study_release import catalogue
    p=argparse.ArgumentParser();p.add_argument('vault',type=Path);p.add_argument('--workers',type=int,default=4)
    args=p.parse_args();v=args.vault.resolve()
    rows=catalogue(v,Path(__file__).resolve().parents[1]/'data')
    items=[(doi,x) for doi,x in rows.items() if x['file'].lower().endswith('.pdf')]
    index=v/'机器可读全文';index.mkdir(exist_ok=True)
    (index/'书目.json').write_text(json.dumps({d:{'title':x['title'],'text':str(paths(v,x['sha'])[0].relative_to(index)).replace('\\','/')} for d,x in items},ensure_ascii=False),encoding='utf8')
    def convert(item):
        doi,w=item
        try:
            _,m=cached_pages(v,v/w['file'],w['sha'])
            return dict(id=doi,pages=m['pages'],methods=m['methods'],checkPages=m['checkPages'])
        except Exception as e:return dict(id=doi,error=str(e))
    with ThreadPoolExecutor(args.workers) as pool,(index/'转换记录.jsonl').open('w',encoding='utf8') as log:
        for row in pool.map(convert,items):log.write(json.dumps(row,ensure_ascii=False)+'\n');log.flush()
if __name__=='__main__':main()
