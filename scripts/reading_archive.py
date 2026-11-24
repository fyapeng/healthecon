"""Build the public reading index and lazy-loaded abstracts for every archive year."""

import argparse
import html
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

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


def normalized(text):
    text = unicodedata.normalize("NFKD", plain(text)).casefold()
    return "".join(c for c in text if c.isalnum())


def abs_text(text, title):
    text = re.sub(r"^Abstract\b[\s:.–-]*", "", plain(text), flags=re.IGNORECASE)
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


def build(args):
    raw = args.source / "采集"
    cat = args.source / "书目"
    papers = {w["id"]: w for w in load(DATA / "catalog.json")}
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
        text = abs_text(value, papers[key]["title"])
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
    issue_file = raw / "JHE卷期" / "0167-6296.json"
    jhe_issues = load(issue_file) if issue_file.exists() else {}
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
        t = plain(w["title"]).casefold().strip(" .:")
        if w["venue"] in SPECIAL:
            # Truncated or machine-translated secondary records of indexed JHE articles.
            if key in {
                "https://openalex.org/W2945701817",
                "https://openalex.org/W3191583633",
                "https://openalex.org/W3209241743",
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
                "editorial committee",
            }
        ):
            continue
        if w.get("aliasOf") or w["year"] < START or w["year"] > args.cutoff[:4]:
            continue
        detail = details[key]
        if w["venue"] == "Journal of Health Economics" and key in jhe_issues:
            volume, issue = jhe_issues[key]
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
        w["hasDetail"] = bool(detail)
        w.pop("sources", None)
        index.append(w)
    dest = DATA / "details"
    dest.mkdir(exist_ok=True)
    for year, rows in groups.items():
        write(dest / (year + ".json"), rows)
    write(DATA / "papers-index.json", index)
    write(
        DATA / "archive-stats.json",
        {
            "cutoff": args.cutoff,
            "top5": years,
            "nber": nber,
            "nberLatest": nber_latest,
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
