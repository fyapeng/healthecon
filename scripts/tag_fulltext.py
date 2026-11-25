"""Parse a DOI-matched PDF and collect local, page-grounded tagging candidates.

Usage: python scripts/tag_fulltext.py DOI FILE.pdf
Outputs stay in private/fulltext. Only editorially reviewed labels enter the index.
"""

import argparse
import hashlib
import json
import re
import tempfile
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pymupdf
import requests

ROOT = Path(__file__).resolve().parents[1]
MODEL = "qwen3-4b-instruct-2507-q8"
POLICY = """Read the numbered PDF pages as source material. Identify only what this
paper itself does. Do not attribute citations, literature review, limitations or proposed
future work to the authors. Each positive needs an exact short continuous quote from
the specific page. Skip labels that cannot be demonstrated on these pages.
Labels:
structural = estimates economically interpretable parameters of a structural model using data; calibration or ordinary regressions alone do not qualify.
theory = develops or formally uses an economic behavioral, equilibrium or mechanism model. A regression equation alone is insufficient.
did = uses differences in changes for treated and comparison groups (including staggered DID).
rd = exploits a cutoff or geographic boundary in a discontinuity design. A before/after change alone does not qualify.
iv = uses an instrument to identify an effect, not simply exogenous variation or mentioning an estimator.
rct = uses an actual randomized intervention or randomized audit/field experiment. Quasi-random assignments and random sampling do not qualify.
admin = analyzes administrative records (claims, discharges, enrollment or routine government records). Data from a government survey alone are not administrative.
survey = analyzes responses to a survey or questionnaire. Audit requests and an agency's administrative records alone are not surveys.
insurance = health coverage, insurance contracts, insurer payments or benefit design are a substantive object of study. Merely using Medicare claims is insufficient.
providers = investigates hospitals' or physicians' choices, referral, treatment, incentives, quality or admissions decisions. Do not count every health institution or a hospital as a mere setting.
patients = investigates actual patient decision-making, choice, demand, adherence or care seeking; outcomes alone do not qualify.
policy = evaluates a specific government policy, intervention or regulation, or directly analyzes its design. Speculative policy implications do not qualify.
Return JSON {"evidence":[{"label":"iv","page":5,"quote":"exact words ..."}]}.
Use at most one piece of evidence per label per batch. No evidence means an empty array."""


def key(s):
    return "".join(
        ch for ch in unicodedata.normalize("NFKC", s).lower() if ch.isalnum()
    )


def write(path, value):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def passages(pages):
    batch, size = [], 0
    for number, raw in enumerate(pages, 1):
        page = " ".join(raw.split())
        # Split long appendices/tables without silently truncating text.
        for start in range(0, len(page), 8500):
            part = f"[PDF PAGE {number}]\n" + page[start : start + 8500]
            if size + len(part) > 11500 and batch:
                yield "\n".join(batch)
                batch, size = [], 0
            batch.append(part)
            size += len(part)
    if batch:
        yield "\n".join(batch)


def read_version(pdf, paper):
    with pymupdf.open(pdf) as doc:
        pages = [p.get_text() for p in doc]
    front = key("\n".join(pages[:2]))
    doi = paper["id"]
    identity = doi.rsplit("/", 1)[-1] if doi.startswith("10.3386/w") else doi
    if key(paper["title"]) not in front or key(identity) not in front:
        raise ValueError(f"Check title and version: {doi}")
    return pages


def fetch_nber(paper, pdf):
    match = re.fullmatch(r"10\.3386/(w\d+)", paper["id"])
    if not match:
        raise ValueError("Provide a local PDF for this publication")
    number = match[1]
    url = f"https://www.nber.org/system/files/working_papers/{number}/{number}.pdf"
    pdf.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=pdf.parent, delete=False) as tmp:
        temporary = Path(tmp.name)
    try:
        with requests.get(url, stream=True, timeout=(10, 90)) as response:
            response.raise_for_status()
            with temporary.open("wb") as out:
                for block in response.iter_content(1 << 20):
                    out.write(block)
        read_version(temporary, paper)
        if not pdf.exists():
            temporary.rename(pdf)
    finally:
        temporary.unlink(missing_ok=True)


def scan(doi, pdf, download=False):
    papers = json.loads((ROOT / "data/papers-index.json").read_text(encoding="utf-8"))
    paper = next(p for p in papers if p["id"] == doi)
    if download and not pdf.exists():
        fetch_nber(paper, pdf)
    pages = read_version(pdf, paper)
    digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
    directory = ROOT / "private/fulltext" / digest
    directory.mkdir(parents=True, exist_ok=True)
    write(
        directory / "pages.json",
        {"doi": doi, "pdf": str(pdf.resolve()), "pages": pages},
    )
    normalized = [key(p) for p in pages]

    def process(task):
        batch, allowed = task
        prompt = (
            POLICY
            + "\nIn this pass, check each of these labels independently: "
            + ", ".join(allowed)
            + ". Return only labels from this list. Use a short verbatim phrase from the authors."
        )
        cachekey = hashlib.sha256((MODEL + prompt + batch).encode()).hexdigest()
        dest = directory / (cachekey + ".json")
        if dest.exists():
            return json.loads(dest.read_text(encoding="utf-8"))
        schema = {
            "type": "object",
            "required": ["evidence"],
            "additionalProperties": False,
            "properties": {
                "evidence": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["label", "page", "quote"],
                        "additionalProperties": False,
                        "properties": {
                            "label": {"type": "string", "enum": list(allowed)},
                            "page": {"type": "integer"},
                            "quote": {"type": "string"},
                        },
                    },
                }
            },
        }
        r = requests.post(
            "http://127.0.0.1:18246/v1/chat/completions",
            json={
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": batch},
                ],
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {"name": "passages", "schema": schema},
                },
                "max_tokens": 1600,
                "temperature": 0,
            },
            timeout=350,
        )
        r.raise_for_status()
        choice = r.json()["choices"][0]
        if choice["finish_reason"] != "stop":
            raise ValueError("Incomplete model output")
        candidates = json.loads(choice["message"]["content"])["evidence"]
        page_numbers = {int(n) for n in re.findall(r"\[PDF PAGE (\d+)\]", batch)}
        valid = []
        for item in candidates:
            n = item.get("page")
            quote = key(str(item.get("quote", "")))
            if (
                item.get("label") in allowed
                and type(n) is int
                and n in page_numbers
                and len(quote) >= 15
                and quote in normalized[n - 1]
            ):
                valid.append(item)
        write(dest, valid)
        return valid

    groups = (
        ("structural", "theory", "did", "rd", "iv", "rct"),
        ("admin", "survey"),
        ("insurance", "providers", "patients", "policy"),
    )
    tasks = ((batch, allowed) for batch in passages(pages) for allowed in groups)
    with ThreadPoolExecutor(max_workers=4) as pool:
        evidence = [e for group in pool.map(process, tasks) for e in group]
    write(
        directory / "candidates.json",
        {"doi": doi, "model": MODEL, "evidence": evidence},
    )
    print(doi, len(pages), "PDF pages;", len(evidence), "matched passages", flush=True)


if __name__ == "__main__":
    cli = argparse.ArgumentParser()
    cli.add_argument("doi")
    cli.add_argument("pdf", type=Path)
    cli.add_argument(
        "--download-if-missing",
        action="store_true",
        help="Fetch from NBER when no local copy exists",
    )
    args = cli.parse_args()
    scan(args.doi, args.pdf, args.download_if_missing)
