"""
Repairs an existing data/exposure_scores.json in place, without needing
network access or an OPENAQ_API_KEY.

What it does NOT do: re-fetch concentrations. If a stored meanConcentration
was itself wrong (e.g. it came from an old un-normalized CO reading), this
script cannot recover the correct number — only a full `python etl/main.py
--once` run with a live API key can. What this script DOES fix is the class
of bug seen in the Beijing/CO example: entries whose score/category were
computed from a different value than the meanConcentration stored right next
to them, or entries whose absurd ratio was being scored at all instead of
flagged "suspect". Every entry's score/category/dataQuality is recomputed
fresh from its own meanConcentration + whoGuideline + population using the
current, single formula in exposure_calc.py.

Usage: python etl/repair_snapshot.py
"""
import json
from pathlib import Path

from exposure_calc import compute_exposure_score, WHO_GUIDELINE_UGM3

DATA_DIR = Path(__file__).parent.parent / "data"
SNAPSHOT_PATH = DATA_DIR / "exposure_scores.json"

# The old snapshot may contain entries computed under the pre-fix guideline
# table (CO guideline of 4 "mg/m3" instead of 4000 "µg/m3"). If an entry's
# unit field says "mg/m³" for CO, its stored meanConcentration is still in
# mg/m³ and needs multiplying by 1000 to become the canonical µg/m³ value
# this script (and the rest of the app) now expects everywhere else.
LEGACY_MG_M3_PARAMETERS = {"co"}


def migrate_value(entry: dict) -> float | None:
    mean = entry.get("meanConcentration")
    if mean is None:
        return None
    unit = (entry.get("unit") or "").strip()
    if entry.get("parameter") in LEGACY_MG_M3_PARAMETERS and unit in ("mg/m³", "mg/m3"):
        return mean * 1000
    return mean


def main():
    if not SNAPSHOT_PATH.exists():
        print(f"No snapshot found at {SNAPSHOT_PATH}")
        return

    data = json.loads(SNAPSHOT_PATH.read_text())
    repaired = []
    changed = 0

    for entry in data:
        mean_ugm3 = migrate_value(entry)
        fresh = compute_exposure_score(
            entry["cityId"], entry["parameter"], mean_ugm3, entry.get("population")
        )
        fresh["cityName"] = entry.get("cityName")
        fresh["country"] = entry.get("country")
        fresh["stationsSampled"] = entry.get("stationsSampled", 0)

        if fresh.get("score") != entry.get("score") or fresh.get("dataQuality") != entry.get("dataQuality"):
            changed += 1
            print(
                f"  fixed {entry.get('cityName')} · {entry['parameter']}: "
                f"score {entry.get('score')} -> {fresh.get('score')}, "
                f"quality {entry.get('dataQuality')} -> {fresh.get('dataQuality')}"
            )

        repaired.append(fresh)

    tmp_path = SNAPSHOT_PATH.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(repaired, indent=2))
    tmp_path.replace(SNAPSHOT_PATH)
    print(f"\n✅ Repaired {changed} of {len(repaired)} entries in {SNAPSHOT_PATH}")


if __name__ == "__main__":
    main()
