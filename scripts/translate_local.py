"""Translate missing bibliographic fields through a local llama.cpp chat server.

Run from any directory. The private SQLite checkpoint is reusable after interruption.
Use --apply after translation to copy validated results into the static website.
"""

import argparse
import hashlib
import json
import re
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
ZH = re.compile(r"[\u3400-\u9fff]")
PREFIX = re.compile(
    r"^(?:(?:该|这篇|这段)?(?:经济学)?论文的(?:标题|摘要)(?:可)?翻译为|以下是(?:该[^：:]{0,12})?译文|中文(?:翻译|译文)|译文|翻译结果|翻译)\s*[:：]\s*"
)
INSTRUCTIONS = re.compile(
    r"将(?:以下|该|这篇)?(?:经济学)?论文的(?:标题|摘要)翻译|译(?:文|后(?:的)?文本).{0,9}(?:如下|应该)|翻译时(?:要|应)|(?:译文|翻译)[:：]\s*以下|作为(?:一个|一名)?(?:AI|翻译助手)|\*\*保持原意\*\*"
)


def clean_translation(value):
    value = PREFIX.sub("", value).strip()
    labels = {
        "rationale": "研究背景",
        "objectives": "研究目的",
        "methodology": "研究方法",
    }

    def heading(match):
        content = match[1].strip()
        return labels.get(content.lower(), content).rstrip(":：") + "："

    return re.sub(r"\*\*([^*\n]{1,35})\*\*\s*", heading, value)


def usable(value):
    return bool(ZH.search(value)) and not (
        INSTRUCTIONS.search(value) or "<think" in value
    )


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def save(p, obj):
    tmp = p.with_name(p.name + ".tmp")
    tmp.write_text(
        json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    tmp.replace(p)


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def chunks(text, limit=1850):
    if len(text) <= limit:
        return [text]
    parts = []
    while len(text) > limit:
        boundaries = [
            m.end() for m in re.finditer(r"(?<=[.!?。！？])\s+", text[:limit])
        ]
        end = boundaries[-1] if boundaries else text.rfind(" ", 1, limit)
        if end <= 0:
            end = limit
        parts.append(text[:end].strip())
        text = text[end:].strip()
    if text:
        parts.append(text)
    return parts


def translate(task, url):
    _, src = task
    answers = []
    for chunk in chunks(src):
        prompt = "翻译成简体中文：\n\n" + chunk
        for attempt in range(3):
            try:
                r = requests.post(
                    url,
                    json={
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.15 if attempt else 0,
                        "max_tokens": 1150,
                        "seed": 77 + attempt,
                    },
                    timeout=(8, 450),
                )
                r.raise_for_status()
                choice = r.json()["choices"][0]
                value = PREFIX.sub("", choice["message"]["content"].strip()).strip()
                if choice["finish_reason"] != "stop" or not usable(value):
                    raise ValueError("incomplete translation")
                if len(chunk) > 300 and len(value) < len(chunk) * 0.12:
                    raise ValueError("short translation")
                if re.search(r"(.{10,70}?)\1{3,}", value):
                    raise ValueError("repeated translation")
                answers.append(value)
                break
            except (requests.RequestException, ValueError, KeyError):
                if attempt == 2:
                    raise
                time.sleep(2 + attempt)
    return "".join(answers)


def run(args):
    folder = ROOT / "private"
    folder.mkdir(exist_ok=True)
    db = sqlite3.connect(folder / "translations.sqlite")
    db.execute(
        "CREATE TABLE IF NOT EXISTS translation (field TEXT, hash TEXT, value TEXT, PRIMARY KEY(field,hash))"
    )
    index = load(DATA / "papers-index.json")
    details = {p.stem: load(p) for p in sorted((DATA / "details").glob("*.json"))}
    tasks = {}
    for w in sorted(index, key=lambda w: (not w["health"], -int(w["year"]))):
        entry = details[w["year"]].get(w["id"], {})
        for field, src, zh in [
            ("title", w["title"], w.get("titleZh")),
            (
                "abstract",
                entry.get("abstract", {}).get("text"),
                entry.get("abstractZh"),
            ),
        ]:
            if not src or zh:
                continue
            tasks[(field, src)] = digest(src)
    known = {
        (field, h): clean_translation(val)
        for field, h, val in db.execute("SELECT field,hash,value FROM translation")
    }
    missing = [
        key for key, h in tasks.items() if not usable(known.get((key[0], h), ""))
    ]
    if not args.apply:
        print(
            f"{len(tasks)} unique fields requested; {len(missing)} remaining",
            flush=True,
        )
        start = time.monotonic()
        failures = 0
        with ThreadPoolExecutor(max_workers=args.jobs) as pool:
            futures = {pool.submit(translate, key, args.url): key for key in missing}
            for i, f in enumerate(as_completed(futures), 1):
                key = futures[f]
                try:
                    value = f.result()
                    db.execute(
                        "INSERT OR REPLACE INTO translation VALUES (?,?,?)",
                        (key[0], tasks[key], value),
                    )
                except (requests.RequestException, ValueError, KeyError) as exc:
                    failures += 1
                    print(f"Retry later {key[0]} {tasks[key]} {exc}", flush=True)
                if i % 25 == 0:
                    db.commit()
                if i % 100 == 0:
                    print(
                        f"{i}/{len(missing)} fields, {failures} pending retries, {time.monotonic() - start:.0f}s",
                        flush=True,
                    )
        db.commit()
        if failures:
            raise SystemExit(f"{failures} fields require a retry")
        return
    if missing:
        raise SystemExit(f"{len(missing)} fields still need translation")
    for w in index:
        entry = details[w["year"]].get(w["id"], {})
        if not w.get("titleZh"):
            v = known.get(("title", digest(w["title"])))
            if v:
                w["titleZh"] = re.sub(r"\s*[*†‡]+$", "", v).rstrip()
        if w["hasAbstract"] and not entry.get("abstractZh"):
            v = known.get(("abstract", digest(entry["abstract"]["text"])))
            if v:
                entry.update(abstractZh=v, translationSource="本地机器翻译")
                w["hasAbstractZh"] = True
    for y, rows in details.items():
        for detail in rows.values():
            if detail.get("abstractZh"):
                detail["abstractZh"] = clean_translation(detail["abstractZh"])
        save(DATA / "details" / (y + ".json"), rows)
    save(DATA / "papers-index.json", index)
    stats = load(DATA / "archive-stats.json")
    stats["summary"]["translated"] = sum(bool(w.get("hasAbstractZh")) for w in index)
    save(DATA / "archive-stats.json", stats)
    print(
        f"{sum(bool(w.get('titleZh')) for w in index)}/{len(index)} titles; {stats['summary']['translated']}/{stats['summary']['abstracts']} abstracts"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--jobs", type=int, default=48)
    parser.add_argument(
        "--url",
        default="http://127.0.0.1:18244/v1/chat/completions",
        choices=["http://127.0.0.1:18244/v1/chat/completions"],
    )
    run(parser.parse_args())
