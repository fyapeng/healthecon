"""Aggregate an immutable public arXiv metadata snapshot; keep only economics records locally."""
import argparse, json, re
from collections import Counter
from pathlib import Path
import duckdb

REV="c428226b689a0e17db2cd55265133b9eca15d97f"
BASE=f"https://huggingface.co/datasets/librarian-bots/arxiv-metadata-snapshot/resolve/{REV}/data/"
if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("cache",type=Path)
    args=ap.parse_args()
    args.cache.mkdir(exist_ok=True,parents=True)
    con=duckdb.connect()
    con.execute("SET threads=3")
    con.execute("SET http_timeout=45")
    for i in reversed(range(11)):
        file=args.cache/f"arxiv-{REV}-{i}.json"
        if file.exists():continue
        url=BASE+f"train-{i:05d}-of-00011.parquet"
        # New-style arXiv IDs encode the initial announcement year and month.
        rows=con.execute("""SELECT substr(id,1,4) AS ym, count(*) AS n,
          count(*) FILTER (WHERE regexp_matches(categories,'(^| )econ[.]')) AS econ
          FROM read_parquet(?) WHERE regexp_matches(id,'^2[1-6][0-1][0-9][.]')
          GROUP BY ym ORDER BY ym""",[url]).fetchall()
        file.write_text(json.dumps(rows),encoding="utf8")
        print(i,len(rows),flush=True)
