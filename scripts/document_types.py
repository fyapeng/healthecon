"""Conservative document-type checks; keep the reason for every withheld record."""
import re
import unicodedata

REFEREES = re.compile(r"^(recent referees|referee list|list of (?:referees|reviewers)|(?:acknowledg(?:e)?ments?|thanks) (?:of|to) (?:the |outstanding )?(?:referees|reviewers))\b", re.I)
MATTER = re.compile(
    r"^(?:front matter|back matter|masthead|title page|forthcoming papers|accepted manuscripts|editorial board|"
    r"inside (?:front|back) cover|(?:front|back) cover|issue information|subscription page|table of contents?|"
    r"announcements?|news notes|list of online reports|jpe (?:turnaround times|submissions)|"
    r"submission of manuscripts to the econometric society|job openings for economists|"
    r"(?:the econometric society annual reports[ .:]*)?report of (?:the )?(?:treasurer|secretary|editor|independent auditor)|"
    r"independent auditors?'?s? report|minutes of the executive committee|general information on the association)"
    r"(?:$|\b[\s:,.\-–—(])", re.I)
JOURNAL_TITLES = {"journal of political economy","american economic review","quarterly journal of economics","econometrica","review of economic studies"}

def disposition(work, toc):
    title = unicodedata.normalize("NFKC",work["title"]).casefold().strip().replace("’","'")
    if (REFEREES.search(title) or re.search(r"econometrica referees\s+\d{4}", title)
            or ("gratefully acknowledges" in title and "refereed" in title)):
        return "期务：审稿人名单或致谢"
    if (title.startswith("the econometric society annual reports") or MATTER.search(title)) or re.search(r" - (?:front|back) cover$",title):
        return "期务：封面、目录或编辑行政事项"
    if "五大刊" in work["sources"] and title.removeprefix("the ") in JOURNAL_TITLES:
        return "待核：仅有刊名"
    if title in {"题名待补","editorial","foreword","erratum","corrigendum"} or re.match(r"^(erratum|corrigendum|retraction notice)\b",title):
        return "待核：题名缺失或特殊文献类型"
    if work["id"] in toc:
        return "待核：卷期目录标为 "+toc[work["id"]]
    return ""

