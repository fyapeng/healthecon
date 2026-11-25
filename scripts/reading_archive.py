"""Build the public reading index and lazy-loaded abstracts for every archive year."""

import argparse
import hashlib
import html
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from channel_indexes import write_channels
from fulltext_tags import read_tags
from import_catalog import SOURCES, identifier, records, write
from observatory import SLUG

DATA = Path(__file__).resolve().parents[1] / "data"
JOURNALS = set(SLUG.values())
# Annual volume numbering, checked against all available issue-directory years.
VOLUME_2003 = {"AER": 93, "QJE": 118, "Econometrica": 71, "JPE": 111, "REStud": 70}
START = "2003"
SPECIAL = {"Journal of Health Economics", "Health Economics"}
WORKING = "工作论文"


# These are mentions in an abstract, not assertions about the author's main estimator.
METHOD_PATTERNS = {
    "随机实验": r"\b(?:randomi[sz]ed (?:controlled |field |policy |clinical )?(?:trials?|experiments?))\b",
    "双重差分": r"\bdifference[s]?[ -]in[ -]difference[s]?\b",
    "断点回归": r"\bregression[ -]discontinuity\b",
    "工具变量": r"\binstrumental[ -]variables?\b",
    "事件研究": r"\bevent[ -]stud(?:y|ies)\b",
    "结构估计": r"\b(?:structural estimation|structurally estimat(?:e|ed|es)|estimat(?:e|es|ing) (?:a|an) (?:dynamic )?structural model)\b",
    "机器学习": r"\bmachine[ -]learning\b",
    "自然实验": r"\bnatural experiments?\b",
}
METHOD_PATTERNS = {k: re.compile(v, re.IGNORECASE) for k, v in METHOD_PATTERNS.items()}


def aer_proceedings(year, issue):
    year = int(year)
    if 2003 <= year <= 2010:
        return issue == "2"
    if 2011 <= year <= 2013:
        return issue == "3"
    return 2014 <= year <= 2017 and issue == "5"


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def plain(value):
    # Strip markup without deleting inequalities such as "p < 0.05".
    value = html.unescape(value or "").replace("\\n", " ")
    value = re.sub(r"</?(?:[a-zA-Z][\w:.-]*)(?:\s+[^<>]*?)?\s*/?>", " ", value)
    return " ".join(value.split())


def clean_title(value):
    text = plain(value).replace("\u00ad", "").replace("\u200b", "")
    return re.sub(r"\s*[*†‡]+$", "", text).rstrip()


def normalized(text):
    text = unicodedata.normalize("NFKD", plain(text)).casefold()
    return "".join(c for c in text if c.isalnum())


def abs_text(text, title):
    text = re.sub(r"^Keywords:.{1,240}?\bABSTRACT\s*:\s*", "", plain(text), flags=re.I)
    if text.startswith(("The copyright to this Article is held by", "SFI Working Papers contain accounts", "Any opinions expressed here are those of the author(s) and not those of the IIIS")):
        return ""
    if re.search(r"JSTOR is a not-for-profit service|you may not download an entire issue|^This manuscript is a .work of the United States Government", text, re.I):
        return ""
    if text.startswith("The analysis and conclusions expressed herein") and "Very Preliminary: Please do not cite without permission of the authors." in text:
        text = text.split("Very Preliminary: Please do not cite without permission of the authors.", 1)[1].strip()
    text = re.sub(r"\s*(?:Copyright\s+©\s+The World Bank Health Economics|\(c\)\s+\d{4}\s+by The University of Chicago\.\s*All\s*rights reserved\.)\s*$", "", text, flags=re.I)
    text = re.sub(r"^©\s*\d{4}\s+The Econometric Society\s*", "", text)
    text = re.sub(r"\s*(?:\(?©\s*(?=\d{4})|\bCopyright\s+(?=(?:\(c\)|[0-9]|the |by |Econometric Society|American Economic Association|John Wiley|Oxford University Press|,\s*(?:Wiley|Oxford)))).{0,450}$", "", text, flags=re.I)
    text = re.sub(r"\s*(?:Published by Elsevier[^.]{0,90}\.\s*)?All rights reserved\.?\s*$", "", text, flags=re.I)
    text = re.sub(r"(?:\s+Copyright)+\s*$", "", text, flags=re.I)
    text = re.sub(r"(?<=[.!?])\s+(?:JEL classification\s*:|Keywords\s*:).+$", "", text, flags=re.I)
    text = (text.replace("ââ blockers", "β-blockers").replace('â€"', "—")
            .replace("â€˜", "‘").replace("â€™", "’").replace("â€œ", "“")
            .replace("passâ€ filtered", "pass” filtered").replace("â€ ", "-")
            .replace("consequence‘", "consequence ‘"))
    text = re.sub(r"^Abstract\b[\s:.–-]*", "", text, flags=re.IGNORECASE)
    text = re.sub(
        r"\s*Institutional subscribers to the NBER working paper series.*$",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip()
    if "Published in volume" in text:
        # AEA metadata snippets sometimes consist entirely of a citation.
        m = re.search(r"(?:\.{3}|…)\s*(.+)$", text)
        if not m:
            return ""
        text = m[1]
    if (
        len(text) < 55
        or normalized(text) == normalized(title)
        or text.upper() == "NULL"
    ):
        return ""
    if re.search(
        r"access to this (?:content|article) is restricted|this article does not have an abstract",
        text,
        re.IGNORECASE,
    ):
        return ""
    return text


def nber_fields(path):
    key, buffer = "", []
    with path.open(encoding="utf-8-sig") as file:
        next(file)
        for line in file:
            m = re.match(r"^([^\s\t]+)\t(.*)", line, re.IGNORECASE)
            if m:
                if key:
                    yield key, plain(" ".join(buffer))
                key, buffer = m[1], [m[2]]
            elif key:
                buffer.append(line.strip())
        if key:
            yield key, plain(" ".join(buffer))


def add_nber(raw, papers, put, cutoff):
    base = raw / "NBER批量目录"
    eh = {n for n, program in nber_fields(base / "prog.tsv") if program == "EH"}
    dates = {
        n: date
        for n, date in nber_fields(base / "date.tsv")
        if re.fullmatch(r"w\d+", n) and START + "-01-01" <= date <= cutoff
    }
    counts = defaultdict(lambda: [0, 0])
    for n, date in dates.items():
        counts[date[:4]][0] += n in eh
        counts[date[:4]][1] += 1
    selected = eh & dates.keys()
    titles = {n: t for n, t in nber_fields(base / "title.tsv") if n in selected}
    authors = defaultdict(list)
    for n, a in nber_fields(base / "auths.tsv"):
        if n in selected and a != "NULL":
            authors[n].append(a)
    with (base / "ref.tsv").open(encoding="utf-8-sig") as file:
        for line in file:
            fields = line.split("\t", 2)
            if (
                len(fields) == 3
                and fields[0] in selected
                and fields[1] not in ("", "NULL")
            ):
                authors[fields[0]] = [fields[1]]
    by_title = defaultdict(list)
    for n in sorted(selected):
        key = "10.3386/" + n
        w = papers.setdefault(key, {"id": key, "sources": []})
        w.update(
            title=titles[n],
            year=dates[n][:4],
            venue="NBER",
            authors=", ".join(authors[n]),
            date=dates[n],
            health=True,
        )
        by_title[normalized(w["title"])].append(key)
    for n, a in nber_fields(base / "abs.tsv"):
        if n in selected:
            put(
                "10.3386/" + n,
                a,
                "NBER",
                "https://www.nber.org/papers/" + n,
                WORKING,
                8,
            )
    return counts, by_title, max(dates.values())


def fill_published_from_nber(raw, papers, details, put):
    """Use a clearly labelled working-paper abstract when NBER confirms its publication."""
    venue_names = {"AER": "American Economic Review", "JPE": "Journal of Political Economy",
                   "QJE": "Quarterly Journal of Economics", "REStud": "Review of Economic Studies",
                   "Econometrica": "Econometrica", **{v: v for v in SPECIAL}}
    missing = defaultdict(list)
    for key, w in papers.items():
        if w.get("venue") in venue_names and not w.get("aliasOf") and "abstract" not in details[key]:
            missing[normalized(w["title"])].append(key)
    base = raw / "NBER批量目录"
    candidates = {}
    for n, title in nber_fields(base / "title.tsv"):
        t = normalized(title)
        if n.startswith("w") and len(t) >= 20 and len(missing.get(t, [])) == 1:
            candidates[n] = missing[t][0]
    matches = defaultdict(set)
    for n, citation in nber_fields(base / "published.tsv"):
        if n not in candidates:
            continue
        key = candidates[n]
        w = papers[key]
        c = normalized(citation)
        if (normalized(w["title"]) in c and normalized(venue_names[w["venue"]]) in c
                and w["year"] in citation):
            matches[key].add(n)
    confirmed = {next(iter(ids)): key for key, ids in matches.items() if len(ids) == 1}
    for n, abstract in nber_fields(base / "abs.tsv"):
        if n in confirmed and abstract != "NULL":
            put(confirmed[n], abstract, "NBER", "https://www.nber.org/papers/" + n, WORKING, 1)


def build(args):
    raw = args.source / "采集"
    cat = args.source / "书目"
    papers = {w["id"]: w for w in load(cat / "catalog.json")}
    excluded = {w["id"] for w in load(DATA / "document_audit.json")}
    for file in (raw / "专业期刊卷期").glob("*-" + args.cutoff + ".json"):
        for key, item in load(file).items():
            types = {x.strip().lower() for x in item["pubType"].split(";")}
            if key in excluded:
                continue
            if types.intersection(
                {
                    "published erratum",
                    "retraction of publication",
                    "editorial",
                    "comment",
                    "news",
                    "letter",
                }
            ):
                papers.pop(key, None)
                continue
            if key not in papers:
                papers[key] = {
                    k: item[k] for k in ("id", "year", "title", "authors", "venue")
                }
            elif papers[key]["venue"] in SPECIAL:
                papers[key]["year"] = item["year"]
    obs = load(DATA / "observatory.json")
    arxiv = load(DATA / "arxiv.json")
    details = defaultdict(dict)
    scores = {}

    def put(key, value, source, url, version, score):
        if key not in papers or scores.get(key, -1) > score:
            return
        if key == "10.1002/hec.4374" and len(value or "") > 10000:
            return  # The harvested text is the special-issue introduction body.
        text = abs_text(value, papers[key]["title"])
        if key in {"10.1257/000282803321947119", "10.1257/000282803321947399"}:
            text = text.replace("� nd", "find").replace("� rst", "first")
        elif key == "10.1162/qjec.2008.123.1.325":
            text = text.replace("e�ective", "effective")
        elif key == "10.1257/aer.97.2.244":
            text = text.replace(", � which", ", which")
        if text:
            details[key]["abstract"] = {
                "text": text,
                "source": source,
                "url": url if url.startswith("https://") else "",
                "version": version,
            }
            scores[key] = score

    for label, file in SOURCES.items():
        for row in records(cat / file):
            key = identifier(row)
            src = row.get("AbstractSource") or (
                "NBER" if label == "NBER 卫生项目" else "OpenAlex"
            )
            wp = (
                label == "NBER 卫生项目"
                or "working-paper" in src
                or key.startswith("10.3386/")
            )
            link = (
                row.get("AbstractSourceLocator")
                or row.get("OpenAlex")
                or row.get("URL")
                or ""
            )
            put(
                key,
                row["Abstract"],
                src,
                link,
                WORKING if wp else "原文",
                2 if wp else 4,
            )
    nber, eh_titles, nber_latest = add_nber(raw, papers, put, args.cutoff)
    for file in [
        *sorted((raw / "欧洲PMC").glob("*-" + args.cutoff + ".json")),
        *sorted((raw / "跨刊摘要").glob("*.json")),
        *sorted((raw / "出版社摘要").glob("*-" + args.cutoff + ".json")),
    ]:
        for key, value in load(file).items():
            put(key, value["text"], value["source"], value["url"], "期刊版", 7)
    for p in arxiv["papers"]:
        papers[p["id"]] = dict(p, health=True)
    for file in (raw / "arxiv镜像").glob("econ-*.json"):
        for ar_id, _, abstract, _, _ in load(file):
            key = "https://arxiv.org/abs/" + ar_id
            put(key, abstract, "arXiv", key, "预印本", 8)

    for w in load(args.top5 / "papers.json"):
        key = w["doi"].lower()
        if key not in papers:
            continue
        working = w.get("abstract_source") == "working-paper"
        put(
            key,
            w.get("abstract"),
            "Top5 Papers · " + str(w.get("abstract_source") or "期刊"),
            "https://doi.org/" + key,
            WORKING if working else "期刊版",
            3 if working else 9,
        )
        if w.get("title_cn"):
            papers[key]["titleZh"] = w["title_cn"]
        if (
            w.get("abstract")
            and w.get("abstract_cn_src") == w["abstract"][:80]
            and w.get("abstract_cn")
            and details[key].get("abstract", {}).get("text")
            == abs_text(w["abstract"], papers[key]["title"])
        ):
            details[key]["abstractZh"] = w["abstract_cn"]
            details[key]["translationSource"] = "Top5 Papers"
    for batch in load(args.weekly / "archive.json"):
        for w in batch["papers"]:
            key = "10.3386/" + w["id"]
            if key not in papers:
                continue
            put(key, w.get("abstract"), "NBER", w["url"], WORKING, 9)
            status = w.get("translation_status") or {}
            if (
                status.get("abstract") == "success"
                and w.get("abstract_cn")
                and w.get("abstract")
            ):
                details[key]["abstractZh"] = w["abstract_cn"]
                details[key]["translationSource"] = "NBER Weekly"
            if status.get("title") == "success" and w.get("title_cn"):
                papers[key]["titleZh"] = w["title_cn"]

    vocab = load(args.senlab / "vocab.json")
    for w in load(args.senlab / "papers.json"):
        key = (w.get("doi") or "").lower().removeprefix("https://doi.org/")
        if key not in papers:
            continue
        # Only public bibliographic fields; ratings, reading history and personal notes are outside this dataset.
        url = "https://fyapeng.com/senlab/papers/" + w["id"] + "/"
        details[key]["senlab"] = url
        if w["abstract_kind"] == "original" and w["lang"] == "en":
            put(key, w.get("abstract"), "SenLab", url, "原文", 3)
        if w.get("jel"):
            details[key]["jel"] = w["jel"]
        country = w.get("country")
        if (
            isinstance(country, str)
            and country in vocab["country"]
            and country not in ("none", "unknown")
        ):
            papers[key]["region"] = vocab["country"][country]
        if w.get("methods"):
            details[key]["methods"] = w["methods"]

    toc = {}
    denom = defaultdict(Counter)
    for r in records(raw / "卷期目录/articles.csv"):
        venue = SLUG.get(r["journal_slug"])
        if venue == "AER" and aer_proceedings(r["year"], r["issue"]):
            continue
        if venue and r["is_research"] == "1":
            if r["volume"].isdigit() and 2003 + int(r["volume"]) - VOLUME_2003[
                venue
            ] != int(r["year"]):
                raise ValueError(("Unexpected volume", venue, r["volume"], r["year"]))
            denom[r["year"]][venue] += 1
            if r["doi"]:
                toc[r["doi"].lower()] = r
    curated = load(DATA / "archive-curation.json")
    bib = {}
    by_slot = defaultdict(list)
    for venue in sorted(JOURNALS):
        for r in load(cat / (venue + ".json")):
            key = r["DOI"].lower()
            if key not in papers:
                continue
            bib[key] = r
            vol, issue = str(r.get("volume", "")), str(r.get("issue", ""))
            pages = str(r.get("page", "")).strip()
            if vol and pages and re.match(r"^\d", pages):
                by_slot[
                    venue,
                    vol,
                    pages.split("-")[0].split("–")[0],
                    normalized(papers[key]["title"]),
                ].append(key)
    this_year = {
        k: v for p in (raw / "本年卷期").glob("*.json") for k, v in load(p).items()
    }
    for key, w in papers.items():
        w.pop("abstractAvailable", None)
        w["health"] = bool(w.get("health")) or w["venue"] in SPECIAL
        if key.startswith("10.2139/ssrn."):
            w["venue"] = "SSRN"
            if "abstract" in details[key]:
                details[key]["abstract"]["version"] = WORKING
        if w["venue"] not in JOURNALS:
            continue
        if key in toc:
            w["year"] = toc[key]["year"]
        r = bib.get(key, {})
        vol = str(r.get("volume", ""))
        issue = str(r.get("issue", ""))
        if vol.isdigit() and issue:
            issue_year = str(2003 + int(vol) - VOLUME_2003[w["venue"]])
            if START <= issue_year < args.cutoff[:4]:
                w["year"] = issue_year
                w["catalogueIssue"] = True
            elif issue_year == args.cutoff[:4] and key in this_year:
                printed = (this_year[key].get("published-print") or {}).get(
                    "date-parts", [[]]
                )[0]
                # Econometrica supplies a year-only online date; the 2026 issue directory
                # confirms volume 94, issues 1–6, as of this frozen snapshot.
                checked_issue = (
                    w["venue"] == "Econometrica"
                    and args.cutoff == "2026-11-24"
                    and issue in ["1", "2", "3", "4", "5", "6"]
                )
                if checked_issue or (
                    printed
                    and tuple(printed) <= tuple(map(int, args.cutoff.split("-")))
                    and printed[0] == int(issue_year)
                ):
                    w.update(year=issue_year, catalogueIssue=True)
        if r.get("volume"):
            details[key]["volume"] = str(r["volume"])
        if r.get("issue"):
            details[key]["issue"] = str(r["issue"])
        if r.get("page"):
            details[key]["pages"] = str(r["page"])
        label = obs["labels"].get(key)
        if label:
            w.update(
                {
                    k: v
                    for k, v in label.items()
                    if k in {"topic", "region", "set", "year", "question"}
                }
            )
        if key in curated:
            w.setdefault("topic", curated[key][0])
        if w["year"] < START:
            continue
        evidence = []
        if label or key in curated:
            evidence.append("编辑选录")
        text = details[key].get("abstract", {}).get("text", "")
        suffix = re.search(
            r"\bJEL(?:\s+(?:classification|codes?))?\s*[:(]?\s*((?:[A-Z]\d{2}[\s,;)]+){1,20}[A-Z]\d{2}|[A-Z]\d{2})",
            text,
            re.IGNORECASE,
        )
        jel = set(details[key].get("jel", []))
        if suffix:
            jel.update(re.findall(r"[A-Z]\d{2}", suffix[1].upper()))
        if jel:
            details[key]["jel"] = sorted(jel)
        if any(re.fullmatch("I1[0-9]", j) for j in jel):
            evidence.append("JEL I1")
        matched = eh_titles.get(normalized(w["title"]), [])
        if len(matched) == 1:
            peer = papers[matched[0]]
            author_words = lambda s: (
                set(re.findall(r"[^\W\d_]{4,}", s.casefold())) - {"and", "with"}
            )
            if (
                len(author_words(w["authors"]) & author_words(peer["authors"])) >= 2
                and peer["year"] <= w["year"]
            ):
                details[key]["workingPaper"] = peer["id"]
                evidence.append("NBER EH 同题同作者")
                if key not in scores and peer["id"] in scores:
                    a = details[peer["id"]]["abstract"]
                    put(key, a["text"], "NBER", a["url"], WORKING, 1)
        if evidence:
            details[key]["classification"] = evidence
        if key in curated or label:
            w["health"] = True
        if w["health"] and key in this_year and key not in toc and not w.get("set"):
            info = this_year[key]
            printed = (info.get("published-print") or {}).get("date-parts", [[]])[0]
            online = (info.get("published-online") or {}).get("date-parts", [[]])[0]
            cutoff_parts = tuple(map(int, args.cutoff.split("-")))
            if (
                printed
                and printed[0] == cutoff_parts[0]
                and tuple(printed) <= cutoff_parts
            ):
                w.update(year=args.cutoff[:4], set="本年卷期")
            elif (
                online
                and online[0] == cutoff_parts[0]
                and (not printed or printed[0] >= cutoff_parts[0])
            ):
                w.update(year=args.cutoff[:4], set="本年在线")
        if w.get("health") and w["year"] == args.cutoff[:4] and w.get("catalogueIssue"):
            w["set"] = "本年卷期"
        if w["venue"] == "AER" and aer_proceedings(w["year"], str(r.get("issue", ""))):
            w["articleType"] = "会议论文"
        if re.search(
            r"^(?:comment on|reply to|presidential address|fisher[–-]schultz lecture)|:\s*(?:comment|reply)$",
            plain(w["title"]),
            re.IGNORECASE,
        ):
            w["articleType"] = "评论或讲座"
    # Resolve duplicate journal DOIs only for the same journal, volume, start page and normalized title.
    for ids in by_slot.values():
        ids = list(dict.fromkeys(ids))
        if len(ids) < 2:
            continue
        chosen = max(
            ids,
            key=lambda k: (
                k in obs["labels"],
                k in toc,
                scores.get(k, -1),
                k.startswith(("10.1093/", "10.1257/aer.")),
            ),
        )
        for alias in ids:
            if alias == chosen:
                continue
            papers[alias]["aliasOf"] = chosen
            if papers[alias]["health"]:
                papers[chosen]["health"] = True
                if papers[alias].get("topic"):
                    papers[chosen].setdefault("topic", papers[alias]["topic"])
            details[chosen].setdefault("alternateIds", []).append(alias)
            if alias in scores and scores[alias] > scores.get(chosen, -1):
                details[chosen]["abstract"] = details[alias]["abstract"]
                scores[chosen] = scores[alias]
                details[chosen].pop("abstractZh", None)
                if "abstractZh" in details[alias]:
                    details[chosen]["abstractZh"] = details[alias]["abstractZh"]
                    details[chosen]["translationSource"] = details[alias][
                        "translationSource"
                    ]

    groups = defaultdict(dict)
    index = []
    specialist_issues = {}
    for issn in ("0167-6296", "1057-9230"):
        issue_file = raw / "JHE卷期" / (issn + ".json")
        if issue_file.exists():
            specialist_issues.update(load(issue_file))
    fill_published_from_nber(raw, papers, details, put)
    translations = load(DATA / "editorial-translations.json")
    reviewed_tags = read_tags(DATA)
    years = {
        str(y): {
            j: {
                "found": 0,
                "total": denom[str(y)].get(j),
                "inToc": 0,
                "cataloguedTotal": 0,
                "cataloguedHealth": 0,
            }
            for j in sorted(JOURNALS)
        }
        for y in range(int(START), int(args.cutoff[:4]) + 1)
    }
    for key, w in sorted(papers.items()):
        w["title"] = clean_title(w["title"]).replace("Using�Bounds", "Using Bounds").replace("Social�Value�of�Information", "Social Value of Information")
        if w.get("authors"):
            w["authors"] = w["authors"].replace("Andrea Szab�", "Andrea Szabó").replace("I. Fern�ndez-Val", "I. Fernández-Val")
        if w.get("region") == "待核":
            w.pop("region")
        t = w["title"].casefold().strip(" .:")
        # Named administrative items can enter again through supplementary metadata.
        if re.fullmatch(r"(?:guest )?editors?['’]s? introduction|index to volume \d+|notice|books received|honors and awards", t):
            continue
        if w["venue"] in JOURNALS and re.match(
            r"^(?:minutes of the (?:annual|meeting of the executive committee)|"
            r"proceedings of the one hundred .+? annual meeting|"
            r"the econometric society (?:research monograph series report of the editors|\d{4} annual report of the president)|"
            r"ad hoc search committee for the editor|report on the committee on the status of|"
            r"reports? of the (?:selection committee for|editors?\b|president\b|finance committee|director\b|"
            r"committee on|search committee|representative to the international economic association|first four years of the aea committee)|"
            r"committee on (?:economic education|the status of)|american economic association (?:committee on statistics|universal academic questionnaire)|"
            r"editor, (?:american economic review|journal of economic (?:literature|perspectives)))", t
        ):
            continue
        if re.match(r"^(?:retraction|corrigendum|erratum|withdrawal notice)\s*:", t):
            continue
        if key == "10.1002/hec.3490":
            w["articleType"] = "已撤稿"
        if w["venue"] in SPECIAL:
            # Truncated or machine-translated secondary records of indexed JHE articles.
            if key in {
                "https://openalex.org/W2945701817",
                "https://openalex.org/W3191583633",
                "https://openalex.org/W3209241743",
                "https://openalex.org/W2792644040",  # book review
                "https://openalex.org/W3082628320",  # workshop introduction
            }:
                continue
            is_notice = re.search(
                r"annual kenneth j\.? arrow award|european workshop on econometrics and health economics|^ihea student competition|call for proposals:|^book reviews?$|^publisher['’]s note$",
                t,
            )
            is_book = re.search(
                r"\bby\b.+(?:university press|john wiley|isbn|unsw press|mcgraw.hill)",
                t,
            )
            is_exchange = re.search(
                r"^(?:comments? (?:on|to)|reply to|response to) |^comment[—–]|[:;] (?:a |an )?(?:reply|response|rejoinder) to ",
                t,
            )
            if is_notice or is_book or is_exchange:
                continue
        if (
            re.match(
                r"^(?:front\s*matter|back\s*matter|correction to|corrigendum to|issue information|list of referees|referees for|announcements? of)\b",
                t,
            )
            or re.fullmatch(
                r"acknowledg(?:e)?ments?(?: to (?:our )?(?:reviewers|referees))?(?:[ ,:–-]+[0-9–-]+)?",
                t,
            )
            or t
            in {
                "health economics",
                "journal of health economics",
                "introductory comments",
                "list of contributors",
                "author index",
                "subject index",
                "cover image",
                "editorial announcement",
                "forthcoming articles",
                "editorial committee", "announcements", "accepted manuscripts",
                "news notes", "forthcoming papers", "index", "guest editors' introduction",
                "guest editors’ introduction",
            }
        ):
            continue
        if w.get("aliasOf") or w["year"] < START or w["year"] > args.cutoff[:4]:
            continue
        detail = details[key]
        if w["venue"] in SPECIAL and key in specialist_issues:
            volume, issue = specialist_issues[key]
            w["volume"] = volume
            if issue:
                w["issue"] = issue
        if w["venue"] in JOURNALS and w["health"]:
            for field in ("volume", "issue"):
                if detail.get(field):
                    w[field] = detail[field]
        if (
            w.get("catalogueIssue")
            and not w.get("articleType")
            and w.get("set") != "本年在线"
        ):
            cell = years[w["year"]][w["venue"]]
            cell["cataloguedTotal"] += 1
            if w["health"]:
                cell["cataloguedHealth"] += 1
        if (
            w["venue"] in JOURNALS
            and w.get("health")
            and not w.get("articleType")
            and w.get("set") != "本年在线"
        ):
            cell = years[w["year"]][w["venue"]]
            cell["found"] += 1
            if key in toc:
                cell["inToc"] += 1
                w["inToc"] = True
            w["trend"] = True
        if w["health"] and "abstract" in detail:
            text = detail["abstract"]["text"]
            mentions = [
                label
                for label, pattern in METHOD_PATTERNS.items()
                if pattern.search(text)
            ]
            if mentions:
                w["methodMentions"] = mentions
        if detail:
            groups[w["year"]][key] = detail
        w["hasAbstract"] = "abstract" in detail
        translation = translations.get(key, {})
        if clean_title(translation.get("sourceTitle")) == w["title"]:
            w.setdefault("titleZh", translation["titleZh"])
            if translation.get("abstractZh") and w["hasAbstract"]:
                digest = hashlib.sha256(detail["abstract"]["text"].encode()).hexdigest()
                if digest == translation["abstractDigest"] and not detail.get("abstractZh"):
                    detail.update(abstractZh=translation["abstractZh"], translationSource="healthecon · AI 辅助翻译")
        if w.get("titleZh"):
            w["titleZh"] = clean_title(w["titleZh"])
        if detail.get("abstractZh"):
            w["hasAbstractZh"] = True
        w["hasDetail"] = bool(detail)
        w.pop("sources", None)
        if key in reviewed_tags:
            w["fulltextTags"] = reviewed_tags[key]
        index.append(w)
    # Rebuilding the catalogue must retain published translations whose source still matches.
    prior_index = DATA / "papers-index.json"
    if prior_index.exists():
        old = {w["id"]: w for w in load(prior_index)}
        old_years = {}
        for w in index:
            prev = old.get(w["id"])
            if not prev:
                continue
            if prev["title"] == w["title"] and prev.get("titleZh"):
                w.setdefault("titleZh", prev["titleZh"])
            if not prev.get("hasAbstractZh") or not w["hasAbstract"] or w.get("hasAbstractZh"):
                continue
            year = prev["year"]
            if year not in old_years:
                filename = DATA / "details" / (year + ".json")
                old_years[year] = load(filename) if filename.exists() else {}
            earlier = old_years[year].get(w["id"], {})
            detail = groups[w["year"]][w["id"]]
            if earlier.get("abstract", {}).get("text") == detail["abstract"]["text"] and earlier.get("abstractZh"):
                detail["abstractZh"] = earlier["abstractZh"]
                detail["translationSource"] = earlier.get("translationSource", "本地机器翻译")
                w["hasAbstractZh"] = True
    dest = DATA / "details"
    dest.mkdir(exist_ok=True)
    for year, rows in groups.items():
        write(dest / (year + ".json"), rows)
    write(DATA / "papers-index.json", index)
    write_channels(DATA, index)
    write(
        DATA / "archive-stats.json",
        {
            "cutoff": args.cutoff,
            "top5": years,
            "nber": nber,
            "nberLatest": nber_latest,
            "he": dict(Counter(w["year"] for w in index if w["venue"] == "Health Economics")),
            "jhe": {
                year: sum(w["venue"] == "Journal of Health Economics" and w["year"] == year
                          for w in index)
                for year in years
            },
            "topics": Counter(
                w["topic"] for w in index if w.get("health") and w.get("topic")
            ),
            "summary": {
                "papers": len(index),
                "abstracts": sum(w["hasAbstract"] for w in index),
                "translated": sum(
                    "abstractZh" in d for rows in groups.values() for d in rows.values()
                ),
                "alternateIds": sum(
                    len(d.get("alternateIds", []))
                    for rows in groups.values()
                    for d in rows.values()
                ),
            },
        },
    )
    print(load(DATA / "archive-stats.json")["summary"])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    for name in ("source", "top5", "weekly", "senlab"):
        ap.add_argument(name, type=Path)
    ap.add_argument("--cutoff", required=True)
    build(ap.parse_args())
