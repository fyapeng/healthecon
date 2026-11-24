import json
import sys
from collections import defaultdict
from pathlib import Path

from arxiv_snapshot import REV

cache = Path(sys.argv[1])
years = defaultdict(lambda: [0, 0])
months = set()
for i in range(11):
    for ym, n, e in json.loads((cache / f"arxiv-{REV}-{i}.json").read_text()):
        years["20" + ym[:2]][0] += n
        years["20" + ym[:2]][1] += e
        months.add(ym)
economic_recent = sum(y[1] for y in years.values())
for i in range(11):
    for ym, total, econ in json.loads(
        (cache / f"historical-{REV}-{i}.json").read_text(encoding="utf8")
    ):
        years["20" + ym[:2]][0] += total
        years["20" + ym[:2]][1] += econ
        months.add(ym)
tags = {
    "2105.00617": ("健康保险", "加纳"),
    "2106.11387": ("器官配置", "理论"),
    "2203.01778": ("药品与创新", "美国"),
    "2201.07072": ("健康保险", "美国"),
    "2304.00482": ("医疗供给", "西班牙"),
    "2402.04472": ("医疗供给", "加拿大"),
    "2405.08168": ("医疗供给", "美国"),
    "2508.13102": ("健康保险", "意大利"),
    "2510.13791": ("健康保险", "美国"),
    "2609.18147": ("器官配置", "理论"),
    "2609.10380": ("医疗供给", "英国"),
    "2609.27732": ("人口健康", "瑞士"),
    "2607.07770": ("健康保险", "美国"),
}
papers = []
seen = set()
for file in cache.glob("econ-*.json"):
    for id, title, abstract, categories, authors in json.loads(
        file.read_text(encoding="utf8")
    ):
        if id in seen:
            raise ValueError(id)
        seen.add(id)
        if id not in tags:
            continue
        papers.append(
            dict(
                id="https://arxiv.org/abs/" + id,
                title=" ".join(title.split()),
                year="20" + id[:2],
                venue="arXiv",
                authors=authors,
                topic=tags[id][0],
                region=tags[id][1],
                set="预印本初读",
            )
        )
assert len(papers) == len(tags)
assert len(seen) == economic_recent, (len(seen), sum(y[1] for y in years.values()))
last = max(months)
(Path(__file__).resolve().parents[1] / "data/arxiv.json").write_text(
    json.dumps(
        dict(years=years, lastMonth="20" + last[:2] + "-" + last[2:], papers=papers),
        ensure_ascii=False,
    ),
    encoding="utf8",
)
print("econ records", len(seen), "latest", last)
