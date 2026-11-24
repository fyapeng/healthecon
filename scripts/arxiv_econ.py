"""Discover econ.* cross-listed arXiv manuscripts for reading, preserving original IDs."""
from pathlib import Path
import json,sys
import duckdb
from arxiv_snapshot import BASE,REV
cache=Path(sys.argv[1])
con=duckdb.connect();con.execute("SET threads=3")
for i in range(11):
    counts=cache/f"arxiv-{REV}-{i}.json"
    if not counts.exists() or not json.loads(counts.read_text()):continue
    file=cache/f"econ-{i}.json"
    if file.exists():continue
    url=BASE+f"train-{i:05d}-of-00011.parquet"
    rows=con.execute("""SELECT id,title,abstract,categories,authors FROM read_parquet(?)
      WHERE id>='2101.' AND id<'2612.' AND regexp_matches(categories,'(^| )econ[.]')""",[url]).fetchall()
    file.write_text(json.dumps(rows,ensure_ascii=False),encoding="utf8");print(i,len(rows),flush=True)
