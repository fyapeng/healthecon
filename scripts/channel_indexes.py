"""Publish the health catalogue in independent source files for browsing."""
from import_catalog import write

VENUES = {
    **dict.fromkeys(("AER", "QJE", "JPE", "REStud", "Econometrica"), "top5"),
    "NBER": "nber",
    "Journal of Health Economics": "jhe",
    "Health Economics": "he",
}


def write_channels(data, records):
    directory = data / "index"
    directory.mkdir(exist_ok=True)
    groups = {key: [] for key in ("top5", "nber", "jhe", "he", "other")}
    for record in records:
        if record["health"]:
            groups[VENUES.get(record["venue"], "other")].append(record)
    for name, rows in groups.items():
        write(directory / (name + ".json"), rows)
