"""Extract named sections for translation, keeping the exact source ranges private."""
import re
from pathlib import Path
from lxml import etree as ET
import pymupdf

INTRO = re.compile(r"^introduct(?:ion|ory remarks)(?:\s+(?:and|to)\b.*)?$", re.I)
LIT = re.compile(r"literature (?:review|and|on)|related (?:literature|work|studies)|previous (?:studies|research)|prior (?:research|work)|^literature$", re.I)
END = re.compile(r"conclu(?:sions?|ding remarks|ding discussion)|discussion and implications", re.I)
BOUND = re.compile(r"references|bibliography|appendi[xc]|acknowledg", re.I)
NUMBER = re.compile(r"^(?:section\s+)?(?:\d{1,2}|[IVXL]{1,5})[.:)]?\s+",re.I)
TITLE = re.compile(r"^(?:introduction|background|data(?: and .*)?|institutional (?:setting|background)|the model|empirical (?:strategy|analysis)|methods|results|conclusions?|discussion|references|bibliography|appendix|related literature)$",re.I)
def kind(s):
    if INTRO.match(s):return "引言"
    if LIT.search(s):return "相关研究"
    if END.search(s):return "结论"
    return ""

def select(groups):
    intro=max((paras for k,paras in groups if k=="引言" and paras),key=lambda ps:sum(map(len,ps)),default=[])
    if len(" ".join(intro).split()) > 6000:raise ValueError("引言止点待核")
    if len(" ".join(intro).split())<75:raise ValueError("引言过短或抽到目录")
    if not intro:raise ValueError("引言边界待核")
    if len(" ".join(intro).split())>=900:return [("引言",intro)]
    extra=[(k,p) for k,p in groups if k in {"相关研究","结论"} and p]
    if not any(k=="结论" for k,p in extra):raise ValueError("短引言的结论边界待核")
    return [("引言",intro),*extra]

def xml_sections(path):
    root=ET.parse(str(path));body=root.find(".//body")
    def plain(el):
        return " ".join("".join(el.itertext()).split())
    def paras(sec):
        return [plain(p) for p in sec.findall("p") if plain(p)]
    groups=[("引言",paras(body))]
    for sec in body.iter("sec"):
        heading=NUMBER.sub("",plain(sec.find("title"))) if sec.find("title") is not None else ""
        if k:=kind(heading):
            groups.append((k,[plain(p) for p in sec.xpath(".//p[not(ancestor::table-wrap or ancestor::fig or ancestor::fn)]")]))
    return select(groups)

def pdf_sections(path):
    from collections import Counter
    with pymupdf.open(path) as doc:
        toc={re.sub(r"\W+","",NUMBER.sub("",h)).lower() for level,h,n in doc.get_toc() if level==1 and n>0}
        groups=[];active=None;started=False;after=-1
        for i,page in enumerate(doc):
            blocks=page.get_text("dict",flags=pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES)["blocks"]
            lines=[[sp for sp in line["spans"] if sp["text"]] for b in blocks for line in b.get("lines",[])]
            texts=["".join(s["text"] for s in line).strip() for line in lines]
            if i<5 and any(re.fullmatch(r"(?:table of )?contents",t,re.I) for t in texts):
                after=i+1;continue
            if i<4 and "ABSTRACT" in texts and any("NBER Working Paper" in t for t in texts):
                after=i+1;continue
            if i==after and not started:
                started=True;active=[];groups.append(("引言",active))
            sizes=Counter()
            for spans in lines:
                for sp in spans:sizes[round(sp["size"],1)]+=len(sp["text"])
            if not sizes:continue
            body_size=sizes.most_common(1)[0][0];pending_number=False
            for t,spans in zip(texts,lines):
                if not t or re.fullmatch(r"Page \d+ of \d+",t,re.I):continue
                first=max(spans,key=lambda sp:len(sp["text"].strip()))
                emph=("bold" in first["font"].lower() or first["size"]>body_size*1.08)
                if re.fullmatch(r"(?:\d{1,3}|[IVX]{1,5})[.)]?",t):
                    pending_number=emph;continue
                numbered=bool(NUMBER.match(t)) or pending_number;pending_number=False
                title=NUMBER.sub("",t).strip(" .:")
                bookmarked=re.sub(r"\W+","",title).lower() in toc
                heading=(bookmarked or TITLE.fullmatch(title) or
                         (numbered and (emph or len(title.split())<=6) and title[:1].isupper() and not t.endswith((".","?"))) or
                         (emph and kind(title) and len(title.split())<11))
                if heading and len(title)<110 and (started or kind(title)=="引言"):
                    if BOUND.match(title):return select(groups)
                    k=kind(title);started=True;active=[] if k else None
                    if k:groups.append((k,active))
                    continue
                if active is None or first["size"]<body_size*.88:continue
                if re.match(r"^(?:Figure|Table|Panel)\s+[A-Z0-9]",t,re.I):continue
                if len(t.split())<4 and not re.search(r"[.!?,;:\-]$",t) and (len(t)<10 or first["font"].lower().find("bold")>=0):continue
                if active and (not re.search(r'[.!?][”"\)\d]*$',active[-1]) or len(active[-1].split())<70):
                    if active[-1].endswith("-") and t[:1].islower():active[-1]=active[-1][:-1]+t
                    else:active[-1]+=" "+t
                else:active.append(t)
        return select(groups)
