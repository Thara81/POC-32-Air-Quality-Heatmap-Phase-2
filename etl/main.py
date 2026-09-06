"""
Air Quality Heatmap — batch ETL.

This is now the ONLY ETL script in this project. It replaces main_fixed.py,
full_etl.py, slow_etl.py, and working_etl.py, which had each independently
grown their own slightly different (and in places buggy) copy of the same
"fetch OpenAQ + WorldPop, compute a score, write a snapshot" logic. Having
five near-duplicate scripts able to write the same data/exposure_scores.json
file was the root cause of a real bug: a Beijing/CO entry in the snapshot
had a score (44, "Moderate") computed from a different mean concentration
than the one actually stored in that same entry (ratio 112,635x, which
should score ~100/"Severe"). That kind of drift is only possible when
several independent code paths can write to the same file, or when a file
is patched in place field-by-field (see the removed update_snapshot.py).

Fixes in this version:
  1. Single code path. One script, one CITIES list, one scoring function
     (etl/exposure_calc.py), imported — not copy-pasted.
  2. Unit normalization. Every measurement is converted to µg/m³ before
     it's averaged or compared to a guideline (see fetch_city_mean).
  3. Outlier rejection. A single glitched sensor reading can no longer
     dominate a city's mean — see _reject_outliers.
  4. Atomic writes. The whole snapshot is computed in memory and written
     to disk in one shot (write_snapshot), never patched field-by-field
     for a subset of cities/pollutants the way update_snapshot.py did.

Run a single batch:  OPENAQ_API_KEY=... python etl/main.py --once
Serve it:            uvicorn etl.main:app --reload --port 8010
"""
import asyncio
import json
import os
import statistics
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from exposure_calc import compute_exposure_score, WHO_GUIDELINE_UGM3

OPENAQ_BASE = "https://api.openaq.org/v3"
WORLDPOP_BASE = os.environ.get("WORLDPOP_API_BASE", "https://api.worldpop.org/v1")
DATA_DIR = Path(__file__).parent.parent / "data"
SNAPSHOT_PATH = DATA_DIR / "exposure_scores.json"

CITIES = [
    {"id": "delhi", "name": "Delhi", "country": "IN", "bbox": [76.84, 28.4, 77.35, 28.88]},
    {"id": "los-angeles", "name": "Los Angeles", "country": "US", "bbox": [-118.67, 33.7, -118.15, 34.34]},
    {"id": "london", "name": "London", "country": "GB", "bbox": [-0.51, 51.29, 0.33, 51.69]},
    {"id": "jakarta", "name": "Jakarta", "country": "ID", "bbox": [106.68, -6.37, 106.97, -6.08]},
    {"id": "lagos", "name": "Lagos", "country": "NG", "bbox": [3.05, 6.35, 3.68, 6.7]},
    {"id": "warsaw", "name": "Warsaw", "country": "PL", "bbox": [20.85, 52.1, 21.27, 52.37]},
    {"id": "sao-paulo", "name": "São Paulo", "country": "BR", "bbox": [-46.83, -23.73, -46.36, -23.36]},
    {"id": "beijing", "name": "Beijing", "country": "CN", "bbox": [116.0, 39.65, 116.8, 40.2]},
]

POLLUTANTS = list(WHO_GUIDELINE_UGM3.keys())

# Known unit strings OpenAQ reports, normalized to a µg/m³ multiplier.
# Anything not in this table is treated as untrustworthy and dropped rather
# than silently mis-scaled — this is what the old code did wrong for CO.
UNIT_TO_UGM3 = {
    "ug/m3": 1.0,
    "mg/m3": 1000.0,
}


def _normalize_to_ugm3(value: float, unit: Optional[str]) -> Optional[float]:
    if value is None:
        return None
    normalized_unit = (unit or "").strip().lower().replace("μ", "u").replace("µ", "u").replace("³", "3")
    factor = UNIT_TO_UGM3.get(normalized_unit)
    if factor is None:
        # e.g. "ppm"/"ppb" for gases need a species- and temperature-
        # dependent conversion we don't have inputs for here. Rather than
        # guess (which is exactly how the CO bug happened), drop the point.
        return None
    return value * factor


def _log_openaq_error(response: httpx.Response, request_name: str) -> None:
    body = response.text.replace("\n", " ").strip()[:300]
    print(f"  OpenAQ {request_name} failed ({response.status_code}): {body}")


def _reject_outliers(values: list[float]) -> list[float]:
    """Median-absolute-deviation filter so one glitched sensor reading
    can't dominate a city's mean. Falls back to returning everything if
    there isn't enough data to compute a meaningful spread."""
    if len(values) < 4:
        return values
    med = statistics.median(values)
    mad = statistics.median([abs(v - med) for v in values]) or 1e-9
    # ~3.5 MAD is a standard robust-outlier cutoff (Iglewicz & Hoaglin).
    return [v for v in values if abs(v - med) / mad <= 3.5] or values


async def fetch_city_mean_ugm3(
    client: httpx.AsyncClient, bbox, parameter: str
) -> tuple[Optional[float], int]:
    """Returns (mean concentration in µg/m³, stations sampled)."""
    api_key = os.environ.get("OPENAQ_API_KEY")
    if not api_key:
        return None, 0

    headers = {"X-API-Key": api_key}

    try:
        loc_res = await client.get(
            f"{OPENAQ_BASE}/locations",
            params={"bbox": ",".join(map(str, bbox)), "limit": 50},
            headers=headers,
        )
    except httpx.HTTPError as exc:
        print(f"  OpenAQ locations request failed: {exc}")
        return None, 0
    if loc_res.status_code != 200:
        _log_openaq_error(loc_res, "locations request")
        return None, 0

    stations = loc_res.json().get("results", [])
    relevant = []
    for s in stations:
        for sensor in s.get("sensors", []):
            sensor_parameter = sensor.get("parameter", {})
            if sensor_parameter.get("name") == parameter and isinstance(sensor.get("id"), int):
                relevant.append((s, sensor))
                break

    if not relevant:
        return None, 0

    relevant = relevant[:6]
    raw_values: list[float] = []

    date_to = datetime.now(timezone.utc)
    date_from = date_to - timedelta(days=7)
    for station, sensor in relevant:
        # v3 measurements are addressed by sensor. The sensor metadata above
        # resolves the pollutant name to its numeric OpenAQ parameter/sensor.
        try:
            m_res = await client.get(
                f"{OPENAQ_BASE}/sensors/{sensor['id']}/measurements",
                params={
                    "datetime_from": date_from.isoformat(),
                    "datetime_to": date_to.isoformat(),
                    "limit": 100,
                },
                headers=headers,
            )
        except httpx.HTTPError as exc:
            print(f"  OpenAQ sensor {sensor['id']} request failed: {exc}")
            continue
        if m_res.status_code != 200:
            _log_openaq_error(m_res, f"sensor {sensor['id']} measurements request")
            continue
        for m in m_res.json().get("results", []):
            value = m.get("value")
            unit = m.get("parameter", {}).get("units")
            normalized = _normalize_to_ugm3(value, unit)
            if normalized is not None and normalized >= 0:
                raw_values.append(normalized)

    if not raw_values:
        return None, len(relevant)

    clean_values = _reject_outliers(raw_values)
    return sum(clean_values) / len(clean_values), len(relevant)


async def fetch_population(client: httpx.AsyncClient, bbox) -> Optional[int]:
    geojson = {
        "type": "Feature",
        "properties": {},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [bbox[0], bbox[1]], [bbox[2], bbox[1]],
                [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]],
            ]],
        },
    }
    try:
        submit = await client.get(
            f"{WORLDPOP_BASE}/services/stats",
            params={"dataset": "wpgppop", "year": 2020, "geojson": json.dumps(geojson), "runasync": "true"},
        )
        task_id = submit.json().get("taskid")
        if not task_id:
            return None
        for _ in range(6):
            await asyncio.sleep(1.5)
            poll = await client.get(f"{WORLDPOP_BASE}/tasks/{task_id}")
            data = poll.json()
            if data.get("status") == "finished":
                return data.get("data", {}).get("total_population")
            if data.get("status") == "failed":
                return None
    except Exception as e:
        print(f"  ⚠️ WorldPop error: {e}")
        return None
    return None


async def run_etl() -> list[dict]:
    print("\n🚀 Starting ETL for all pollutants, all cities...")
    results = []
    async with httpx.AsyncClient(timeout=60.0) as client:
        for idx, city in enumerate(CITIES, 1):
            print(f"\n📍 [{idx}/{len(CITIES)}] {city['name']}...")
            population = await fetch_population(client, city["bbox"])
            print(f"  👥 Population: {population:,}" if population else "  👥 Population: unavailable")

            for parameter in POLLUTANTS:
                mean_ugm3, n_stations = await fetch_city_mean_ugm3(client, city["bbox"], parameter)
                score = compute_exposure_score(city["id"], parameter, mean_ugm3, population)
                score["cityName"] = city["name"]
                score["country"] = city["country"]
                score["stationsSampled"] = n_stations
                results.append(score)

                if score["score"] is not None:
                    print(f"    {parameter}: score {score['score']} ({score['category']})")
                elif score["dataQuality"] == "suspect":
                    print(f"    {parameter}: ⚠️ suspect reading (ratio {score['ratioToGuideline']}x) — excluded from score")
                else:
                    print(f"    {parameter}: no data")

    return results


def write_snapshot(results: list[dict]) -> None:
    """Atomic write: build the full snapshot in memory, then replace the
    file in one operation. Never patch individual fields of an existing
    snapshot in place — that field-by-field mutation pattern (see the
    removed update_snapshot.py) is what let score and meanConcentration
    drift out of sync with each other in the first place."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = SNAPSHOT_PATH.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(results, indent=2))
    tmp_path.replace(SNAPSHOT_PATH)


# --- Optional FastAPI service wrapper (uvicorn etl.main:app) ---
app = FastAPI(title="Air Quality Heatmap ETL")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/run")
async def run_endpoint():
    results = await run_etl()
    write_snapshot(results)
    return {"cities": len(CITIES), "entries": len(results)}


@app.get("/snapshot")
async def snapshot_endpoint():
    if not SNAPSHOT_PATH.exists():
        return {"error": "No snapshot yet. POST /run first."}
    return json.loads(SNAPSHOT_PATH.read_text())


if __name__ == "__main__":
    if "--once" in sys.argv:
        results = asyncio.run(run_etl())
        write_snapshot(results)
        print(f"\n✅ Wrote {len(results)} entries to {SNAPSHOT_PATH}")
        print("\n📊 Summary:")
        for r in results:
            if r["score"] is not None:
                print(f"  {r['cityName']} · {r['parameter']}: {r['score']} ({r['category']}) — {r['stationsSampled']} stations")
            elif r["dataQuality"] == "suspect":
                print(f"  {r['cityName']} · {r['parameter']}: ⚠️ suspect data, excluded")
            else:
                print(f"  {r['cityName']} · {r['parameter']}: no data")
    else:
        print("Run with --once for a single batch, or `uvicorn etl.main:app` to serve it.")
