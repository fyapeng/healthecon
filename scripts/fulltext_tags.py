"""Validated public labels from reviewed versions; private evidence stays out of the index."""

import json
import re

LABELS = {
    "structural": "结构估计",
    "theory": "理论模型",
    "did": "DID",
    "rd": "RD",
    "iv": "IV",
    "rct": "RCT",
    "admin": "行政数据",
    "survey": "调查数据",
    "insurance": "医疗保险",
    "providers": "医院与医生行为",
    "patients": "患者行为",
    "policy": "政府与监管",
}


def read_tags(data):
    source = json.loads((data / "fulltext-tags.json").read_text(encoding="utf-8"))
    reviewed = {}
    for doi, version in source.items():
        labels = version["tags"]
        if (
            not re.fullmatch(r"[0-9a-f]{64}", version["sha256"])
            or not labels
            or labels.keys() - LABELS.keys()
        ):
            raise ValueError(f"Invalid full-text review for {doi}")
        for pages in labels.values():
            if not pages or any(
                type(n) is not int or not 1 <= n <= version["pageCount"] for n in pages
            ):
                raise ValueError(f"Invalid evidence page for {doi}")
        reviewed[doi] = {
            label: labels[code] for code, label in LABELS.items() if code in labels
        }
    return reviewed
