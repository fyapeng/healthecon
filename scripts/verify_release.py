"""Check the published indexes, year files, chart counts, and version links together."""

import argparse
import json
import re
from collections import Counter
from pathlib import Path

from channel_indexes import VENUES

DATA = Path(__file__).resolve().parents[1] / "data"


def load(name):
    return json.loads((DATA / (name + ".json")).read_text(encoding="utf8"))


def verify(bilingual=False):
    works = load("papers-index")
    by_id = {w["id"]: w for w in works}
    assert len(by_id) == len(works), "Duplicate public identifiers"
    for group in ("top5", "nber", "jhe", "he", "other"):
        expected = [w for w in works if w["health"] and VENUES.get(w["venue"], "other") == group]
        assert load("index/" + group) == expected, group
    if bilingual:
        for w in works:
            assert re.search(r"[\u3400-\u9fff]", w.get("titleZh", "")), w["id"]
            assert bool(w.get("hasAbstractZh")) == w["hasAbstract"], w["id"]
    stats = load("archive-stats")
    arxiv = load("arxiv")
    years = {str(y) for y in range(2003, int(stats["cutoff"][:4]) + 1)}
    assert years == set(stats["top5"]) == set(stats["nber"]) == set(arxiv["years"])
    assert {w["year"] for w in works} == years
    counts = Counter()
    nber = Counter()
    jhe = Counter()
    he = Counter()
    abstracts = translated = 0
    for y in sorted(years):
        details = load("details/" + y)
        for key, d in details.items():
            w = by_id[key]
            assert bool(w.get("hasAbstractZh")) == bool(d.get("abstractZh"))
            assert w["year"] == y and w["hasDetail"]
            assert w["hasAbstract"] == bool(d.get("abstract", {}).get("text"))
            if w["hasAbstract"]:
                assert d["abstract"]["source"] and d["abstract"]["version"]
                abstracts += 1
            if d.get("abstractZh"):
                assert w["hasAbstract"]
                if bilingual:
                    assert re.search(r"[\u3400-\u9fff]", d["abstractZh"]), key
                translated += 1
            if "workingPaper" in d:
                assert by_id[d["workingPaper"]]["venue"] == "NBER"
        for w in (w for w in works if w["year"] == y):
            assert w["hasDetail"] == (w["id"] in details)
            if w.get("trend"):
                assert (
                    w["health"]
                    and not w.get("articleType")
                    and w.get("set") != "本年在线"
                )
                counts[y, w["venue"], "found"] += 1
                if w.get("inToc"):
                    counts[y, w["venue"], "inToc"] += 1
                if w.get("catalogueIssue"):
                    counts[y, w["venue"], "cataloguedHealth"] += 1
            if (
                w.get("catalogueIssue")
                and not w.get("articleType")
                and w.get("set") != "本年在线"
            ):
                counts[y, w["venue"], "cataloguedTotal"] += 1
            if w["health"] and w["venue"] == "NBER":
                nber[y] += 1
            if w["venue"] == "Journal of Health Economics":
                assert w["health"]
                jhe[y] += 1
            if w["venue"] == "Health Economics":
                he[y] += 1
        assert nber[y] == stats["nber"][y][0] <= stats["nber"][y][1]
        assert jhe[y] == stats["jhe"][y]
        assert he[y] == stats["he"][y]
        assert 0 <= arxiv["years"][y][1] <= arxiv["years"][y][0]
        for j, cell in stats["top5"][y].items():
            for measure in ("found", "inToc", "cataloguedHealth", "cataloguedTotal"):
                assert cell[measure] == counts[y, j, measure], (y, j, measure)
            assert (
                cell["cataloguedHealth"] <= cell["cataloguedTotal"]
                and cell["cataloguedTotal"] > 0
            )
            if cell["total"] is not None:
                assert cell["inToc"] <= cell["total"]
    assert (
        abstracts == stats["summary"]["abstracts"]
        and translated == stats["summary"]["translated"]
    )
    assert len(works) == stats["summary"]["papers"]
    print(
        f"{len(works)} records; {abstracts} abstracts; {translated} translations; {len(years) * 5} journal-years verified."
    )


if __name__ == "__main__":
    cli = argparse.ArgumentParser()
    cli.add_argument("--bilingual", action="store_true")
    verify(cli.parse_args().bilingual)
