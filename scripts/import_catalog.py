"""Build the public bibliographic snapshot from the review project's CSV exports."""
from document_types import disposition
import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "五大刊": "五刊总目录_补充摘要.csv",
    "卫生经济学期刊": "两份专业期刊目录.csv",
    "NBER 卫生项目": "近年NBER卫生项目目录.csv",
    "引文扩展": "第一轮引文线索.csv",
}


def records(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        yield from csv.DictReader(stream)


def identifier(row):
    doi = row["DOI"].strip().lower()
    return doi or (row.get("OpenAlex") or row.get("URL", "")).strip()


def write(path, value):
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temp.replace(path)


def build(source, cutoff):
    works = {}
    counts = {}
    for label, filename in SOURCES.items():
        counts[label] = 0
        for row in records(source / filename):
            key = identifier(row)
            if not key:
                raise ValueError(f"Missing identifier in {filename}")
            counts[label] += 1
            work = works.setdefault(key, {
                "id": key, "title": row["Title"] or "题名待补", "year": row["Year"],
                "authors": row["Authors"], "venue": row.get("Journal") or row.get("Venue", ""),
                "sources": [], "abstractAvailable": False,
            })
            if label not in work["sources"]:
                work["sources"].append(label)
            if row.get("Abstract", "").strip():
                work["abstractAvailable"] = True
    with (ROOT / "data/toc_special.tsv").open(encoding="utf8") as f:
        toc = {r["doi"]:r["type"] for r in csv.DictReader(f, delimiter="\t")}
    withheld = {}
    for key, work in works.items():
        reason = disposition(work, toc)
        if reason:
            withheld[key] = {"id":key,"title":work["title"],"sources":work["sources"],"reason":reason}
    notes = {}
    order = []
    for row in records(source / "全量阅读顺序.csv"):
        key = identifier(row)
        if key not in works:
            raise ValueError(key)
        if key in withheld:
            continue
        order.append(key)
        note = row["AbstractReview"].strip()
        if note and note != "待核读":
            notes[key] = note
    if len(set(order)) != len(order):
        raise ValueError("Duplicate ranking IDs")
    # Unranked records, e.g. missing titles, are still available in the library.
    library = sorted((w for k,w in works.items() if k not in withheld), key=lambda w: w["id"])
    write(ROOT / "data/document_audit.json", list(withheld.values()))
    write(ROOT / "data/catalog.json", library)
    write(ROOT / "data/coverage.json", {"cutoff": cutoff, "counts": counts})
    write(ROOT / "topics/patient-choice.json", {
        "notes": notes, "order": order,
    })
    print(f"{len(library)} records; {len(order)} ranked; {len(notes)} abstract notes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="Directory of local bibliography CSVs")
    parser.add_argument("--cutoff", required=True, help="Snapshot cutoff (YYYY-MM-DD)")
    args = parser.parse_args()
    build(args.source, args.cutoff)

