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
import email.utils
import hashlib
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

# Demo/PoC city totals used only when WorldPop cannot provide a valid result.
# These values are not live WorldPop measurements and must remain labelled as
# fallback data in the generated snapshot.
FALLBACK_POPULATIONS = {
    "delhi": 19_000_000,
    "los-angeles": 13_000_000,
    "london": 9_000_000,
    "jakarta": 11_000_000,
    "lagos": 15_000_000,
    "warsaw": 1_800_000,
    "sao-paulo": 12_000_000,
    "beijing": 21_500_000,
}

POLLUTANTS = list(WHO_GUIDELINE_UGM3.keys())

# Known unit strings OpenAQ reports, normalized to a µg/m³ multiplier.
# Anything not in this table is treated as untrustworthy and dropped rather
# than silently mis-scaled — this is what the old code did wrong for CO.
UNIT_TO_UGM3 = {
    "ug/m3": 1.0,
    "mg/m3": 1000.0,
}
OPENAQ_MAX_RETRIES = 2
OPENAQ_BACKOFF_SECONDS = 1.0
OPENAQ_MAX_SENSORS_PER_PARAMETER = 2
OPENAQ_MIN_REQUEST_INTERVAL = 1.1
OPENAQ_HOURLY_LIMIT = 48

MOCK_CONCENTRATION_RANGES_UGM3 = {
    "pm25": (3.0, 80.0),
    "pm10": (10.0, 180.0),
    "no2": (5.0, 150.0),
    "o3": (30.0, 220.0),
    "so2": (5.0, 100.0),
    "co": (500.0, 10000.0),
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


def generate_mock_concentration(city_id: str, parameter: str) -> float:
    """Return deterministic demo data, explicitly kept separate from OpenAQ."""
    minimum, maximum = MOCK_CONCENTRATION_RANGES_UGM3[parameter]
    digest = hashlib.sha256(f"{city_id}:{parameter}".encode("ascii")).digest()
    fraction = int.from_bytes(digest[:8], "big") / float(2**64 - 1)
    return round(minimum + fraction * (maximum - minimum), 2)


class OpenAQRequestPacer:
    def __init__(self, minimum_interval: float = OPENAQ_MIN_REQUEST_INTERVAL):
        self.minimum_interval = minimum_interval
        self._last_request_at = 0.0
        self._lock = asyncio.Lock()

    async def wait(self) -> None:
        async with self._lock:
            now = asyncio.get_running_loop().time()
            delay = self.minimum_interval - (now - self._last_request_at)
            if delay > 0:
                await asyncio.sleep(delay)
            self._last_request_at = asyncio.get_running_loop().time()


def _retry_delay(response: httpx.Response, attempt: int) -> float:
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        try:
            return max(0.0, float(retry_after))
        except ValueError:
            try:
                retry_at = email.utils.parsedate_to_datetime(retry_after)
                return max(0.0, retry_at.timestamp() - datetime.now(timezone.utc).timestamp())
            except (TypeError, ValueError, OverflowError):
                pass
    return OPENAQ_BACKOFF_SECONDS * (2 ** attempt)


async def _openaq_get(
    client: httpx.AsyncClient, path: str, params: dict, headers: dict, request_name: str,
    pacer: Optional[OpenAQRequestPacer] = None,
) -> Optional[httpx.Response]:
    for attempt in range(OPENAQ_MAX_RETRIES + 1):
        if pacer is not None:
            await pacer.wait()
        try:
            response = await client.get(f"{OPENAQ_BASE}{path}", params=params, headers=headers)
        except httpx.HTTPError as exc:
            print(f"  OpenAQ {request_name} request failed: {exc}")
            return None
        if response.status_code != 429 or attempt == OPENAQ_MAX_RETRIES:
            return response
        delay = _retry_delay(response, attempt)
        print(f"  OpenAQ {request_name} rate limited (429); retrying in {delay:.1f}s")
        await asyncio.sleep(delay)
    return None


async def discover_city_sensors(
    client: httpx.AsyncClient, bbox, headers: dict,
    pacer: Optional[OpenAQRequestPacer] = None,
) -> dict[str, list[tuple[dict, dict]]]:
    """Discover each city's pollutant sensors once for the current ETL run."""
    loc_res = await _openaq_get(
        client,
        "/locations",
        {"bbox": ",".join(map(str, bbox)), "limit": 50},
        headers,
        "locations request",
        pacer,
    )
    if loc_res is None:
        return {}
    if loc_res.status_code != 200:
        _log_openaq_error(loc_res, "locations request")
        return {}

    sensors_by_parameter: dict[str, list[tuple[dict, dict]]] = {parameter: [] for parameter in POLLUTANTS}
    for station in loc_res.json().get("results", []):
        seen_parameters = set()
        for sensor in station.get("sensors", []):
            parameter = sensor.get("parameter", {}).get("name")
            sensor_id = sensor.get("id")
            if parameter in sensors_by_parameter and parameter not in seen_parameters and isinstance(sensor_id, int):
                sensors_by_parameter[parameter].append((station, sensor))
                seen_parameters.add(parameter)
    return {
        parameter: sensors[:OPENAQ_MAX_SENSORS_PER_PARAMETER]
        for parameter, sensors in sensors_by_parameter.items()
    }


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
    client: httpx.AsyncClient, bbox, parameter: str,
    sensors_by_parameter: Optional[dict[str, list[tuple[dict, dict]]]] = None,
    pacer: Optional[OpenAQRequestPacer] = None,
) -> tuple[Optional[float], int]:
    """Returns (mean concentration in µg/m³, stations sampled)."""
    api_key = os.environ.get("OPENAQ_API_KEY")
    if not api_key:
        return None, 0

    headers = {"X-API-Key": api_key}

    if sensors_by_parameter is None:
        sensors_by_parameter = await discover_city_sensors(client, bbox, headers, pacer)
    relevant = sensors_by_parameter.get(parameter, [])[:OPENAQ_MAX_SENSORS_PER_PARAMETER]

    if not relevant:
        return None, 0

    raw_values: list[float] = []

    date_to = datetime.now(timezone.utc)
    date_from = date_to - timedelta(days=7)
    for station, sensor in relevant:
        # Hourly aggregates keep the seven-day window while avoiding hundreds
        # of raw readings per sensor.
        m_res = await _openaq_get(
            client,
            f"/sensors/{sensor['id']}/hours",
            {
                "datetime_from": date_from.isoformat(),
                "datetime_to": date_to.isoformat(),
                "limit": OPENAQ_HOURLY_LIMIT,
                "sort": "desc",
            },
            headers,
            f"sensor {sensor['id']} measurements request",
            pacer,
        )
        if m_res is None:
            continue
        if m_res.status_code != 200:
            _log_openaq_error(m_res, f"sensor {sensor['id']} measurements request")
            continue
        for m in m_res.json().get("results", []):
            value = m.get("value")
            unit = m.get("parameter", {}).get("units") or sensor.get("parameter", {}).get("units")
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
                [bbox[0], bbox[1]],
                [bbox[2], bbox[1]],
                [bbox[2], bbox[3]],
                [bbox[0], bbox[3]],
                [bbox[0], bbox[1]],
            ]],
        },
    }

    params = {
        "dataset": "wpgppop",
        "year": 2020,
        "geojson": json.dumps(geojson),
        "runasync": "true",
    }

    try:
        # Use a shorter timeout specifically for WorldPop.
        timeout = httpx.Timeout(15.0, connect=5.0)

        async with httpx.AsyncClient(timeout=timeout) as wp_client:
            for attempt in range(2):
                try:
                    submit = await wp_client.get(
                        f"{WORLDPOP_BASE}/services/stats",
                        params=params,
                    )

                    print(
                        f"  WorldPop submit attempt {attempt + 1}: "
                        f"{submit.status_code} {submit.text[:500]}"
                    )

                    submit.raise_for_status()

                    task_id = submit.json().get("taskid")

                    if not task_id:
                        print("  ⚠️ WorldPop response did not contain taskid")
                        return None

                    print(f"  WorldPop task: {task_id}")

                    for poll_attempt in range(10):
                        await asyncio.sleep(2)

                        poll = await wp_client.get(
                            f"{WORLDPOP_BASE}/tasks/{task_id}"
                        )

                        print(
                            f"  WorldPop poll {poll_attempt + 1}: "
                            f"{poll.status_code} {poll.text[:300]}"
                        )

                        poll.raise_for_status()
                        data = poll.json()

                        if data.get("status") == "finished":
                            population = (
                                data.get("data", {})
                                .get("total_population")
                            )

                            if population is not None:
                                print(
                                    f"  WorldPop population: {population}"
                                )
                                return int(population)

                            print(
                                "  ⚠️ WorldPop finished but population "
                                "was missing"
                            )
                            return None

                        if data.get("status") == "failed":
                            print(
                                f"  ⚠️ WorldPop task failed: {data}"
                            )
                            return None

                    print(
                        "  ⚠️ WorldPop task did not finish "
                        "within polling window"
                    )
                    return None

                except (httpx.TimeoutException, httpx.ReadError) as exc:
                    print(
                        f"  ⚠️ WorldPop network error "
                        f"(attempt {attempt + 1}/2): "
                        f"{type(exc).__name__}: {exc}"
                    )

                    if attempt == 0:
                        await asyncio.sleep(2)
                    else:
                        return None

    except Exception as exc:
        print(
            f"  ⚠️ WorldPop error: "
            f"{type(exc).__name__}: {exc}"
        )
        return None


async def run_etl() -> list[dict]:
    print("\n🚀 Starting ETL for all pollutants, all cities...")
    results = []
    async with httpx.AsyncClient(timeout=60.0) as client:
        openaq_pacer = OpenAQRequestPacer()
        for idx, city in enumerate(CITIES, 1):
            print(f"\n📍 [{idx}/{len(CITIES)}] {city['name']}...")
            worldpop_population = await fetch_population(client, city["bbox"])
            has_valid_worldpop = isinstance(worldpop_population, (int, float)) and worldpop_population > 0
            if has_valid_worldpop:
                population = int(worldpop_population)
                population_source = "WorldPop"
                print(f"  👥 Population: {population:,} (WorldPop)")
            else:
                population = FALLBACK_POPULATIONS[city["id"]]
                population_source = "fallback"
                print(f"  ⚠️ WorldPop unavailable — using fallback population: {population:,}")
            api_key = os.environ.get("OPENAQ_API_KEY")
            city_sensors = await discover_city_sensors(
                client, city["bbox"], {"X-API-Key": api_key}, openaq_pacer
            ) if api_key else {}

            for parameter in POLLUTANTS:
                mean_ugm3, n_stations = await fetch_city_mean_ugm3(
                    client, city["bbox"], parameter, city_sensors, openaq_pacer
                )
                is_mock = mean_ugm3 is None
                if is_mock:
                    mean_ugm3 = generate_mock_concentration(city["id"], parameter)
                score = compute_exposure_score(city["id"], parameter, mean_ugm3, population)
                if is_mock:
                    score["dataQuality"] = "mock"
                    n_stations = 0
                score["cityName"] = city["name"]
                score["country"] = city["country"]
                score["populationSource"] = population_source
                score["stationsSampled"] = n_stations
                results.append(score)

                if score["score"] is not None:
                    source = "MOCK — OpenAQ unavailable" if is_mock else "OpenAQ"
                    print(f"    {parameter}: score {score['score']} ({score['category']}) [{source}]")
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
