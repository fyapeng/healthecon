"""Count historical arXiv records, including pre-April 2007 archive-style IDs."""

import argparse
import json
from pathlib import Path

import duckdb
from arxiv_snapshot import BASE, REV


def build(cache):
    db = duckdb.connect()
    db.execute("SET threads=3")
    db.execute("SET http_timeout=90")
    for i in range(11):
        target = cache / f"historical-{REV}-{i}.json"
        if target.exists():
            continue
        url = BASE + f"train-{i:05d}-of-00011.parquet"
        rows = db.execute(
            r"""
            WITH ids AS (
                SELECT coalesce(nullif(regexp_extract(id, '^([0-9]{4})[.]', 1), ''),
                                regexp_extract(id, '/([0-9]{4})[0-9]{3}$', 1)) AS ym, categories
                FROM read_parquet(?)
            )
            SELECT ym, count(*), count(*) FILTER (WHERE regexp_matches(categories, '(^| )econ[.]'))
            FROM ids WHERE ym BETWEEN '0301' AND '2012' GROUP BY ym ORDER BY ym
        """,
            [url],
        ).fetchall()
        target.write_text(json.dumps(rows), encoding="utf8")
        print(i, len(rows), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("cache", type=Path)
    build(parser.parse_args().cache)
