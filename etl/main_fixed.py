"""
FastAPI ETL service for the Air Quality Heatmap rail.
"""
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Optional

import httpx

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
    {"id": "sao-paulo", "name": "Sao Paulo", "country": "BR", "bbox": [-46.83, -23.73, -46.36, -23.36]},
    {"id": "beijing", "name": "Beijing", "country": "CN", "bbox": [116.0, 39.65, 116.8, 40.2]},
]

WHO_GUIDELINE = {
    "pm25": 5.0,
    "pm10": 15.0,
    "no2": 10.0,
    "o3": 100.0,
    "so2": 40.0,
    "co": 4.0,
}

def categorize(score: int) -> str:
    if score < 25: return "Low"
    if score < 50: return "Moderate"
    if score < 75: return "High"
    return "Severe"

def compute_score(city_id, parameter, mean, unit, population):
    guideline = WHO_GUIDELINE[parameter]
    if mean is None:
        return {
            "cityId": city_id, "parameter": parameter,
            "meanConcentration": None, "unit": unit, "whoGuideline": guideline,
            "ratioToGuideline": None, "population": population,
            "score": None, "category": None, "peopleAboveGuideline": None,
            "dataQuality": "unavailable"
        }
    ratio = mean / guideline
    score = round(100 * (1 - 1 / (1 + max(ratio - 1, 0))))
    category = categorize(score)
    people_above = None
    if population:
        people_above = round(population * min(0.95, max(0.0, (ratio - 1) * 0.35)))
    return {
        "cityId": city_id, "parameter": parameter,
        "meanConcentration": mean, "unit": unit,
        "whoGuideline": guideline, "ratioToGuideline": round(ratio, 2),
        "population": population, "score": score,
        "category": category, "peopleAboveGuideline": people_above,
        "dataQuality": "live" if population else "partial"
    }

async def fetch_city_mean(client, bbox, parameter):
    api_key = os.environ.get("OPENAQ_API_KEY")
    if not api_key:
        return None, "µg/m³", 0
    headers = {"X-API-Key": api_key}
    
    # Get locations with bbox filter
    loc_res = await client.get(
        f"{OPENAQ_BASE}/locations",
        params={"bbox": ",".join(map(str, bbox)), "limit": 50},
        headers=headers
    )
    if loc_res.status_code != 200:
        return None, "µg/m³", 0
    
    stations = loc_res.json().get("results", [])
    # Find stations with the parameter
    relevant = []
    for s in stations:
        for sensor in s.get("sensors", []):
            if sensor.get("parameter", {}).get("name") == parameter:
                relevant.append(s)
                break
    
    if not relevant:
        return None, "µg/m³", 0
    
    relevant = relevant[:6]
    values = []
    unit = "µg/m³"
    
    for station in relevant:
        station_id = station["id"]
        m_res = await client.get(
            f"{OPENAQ_BASE}/locations/{station_id}/measurements",
            params={"limit": 100, "sort": "desc"},
            headers=headers,
        )
        if m_res.status_code != 200:
            continue
        for m in m_res.json().get("results", []):
            if m.get("value") is not None:
                values.append(m["value"])
                if m.get("parameter", {}).get("units"):
                    unit = m["parameter"]["units"]
    
    if not values:
        return None, unit, len(relevant)
    return sum(values) / len(values), unit, len(relevant)

async def fetch_population(client, bbox):
    try:
        geojson = {
            "type": "Feature",
            "properties": {},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [bbox[0], bbox[1]], [bbox[2], bbox[1]], 
                    [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]]
                ]],
            },
        }
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
    except:
        return None
    return None

async def run_etl(parameter="pm25"):
    print(f"\n🚀 Starting ETL for {parameter}...")
    results = []
    async with httpx.AsyncClient(timeout=60.0) as client:
        for idx, city in enumerate(CITIES, 1):
            print(f"\n📍 [{idx}/{len(CITIES)}] Processing {city['name']}...")
            mean, unit, n_stations = await fetch_city_mean(client, city["bbox"], parameter)
            population = await fetch_population(client, city["bbox"])
            print(f"  👥 Population: {population:,}" if population else "  👥 Population: unavailable")
            print(f"  📊 Stations: {n_stations}")
            if mean:
                print(f"  🌫️ Mean {parameter}: {mean:.1f} {unit}")
            score = compute_score(city["id"], parameter, mean, unit, population)
            score["cityName"] = city["name"]
            score["country"] = city["country"]
            score["stationsSampled"] = n_stations
            score["computedAt"] = "2026-07-17T12:00:00+00:00"
            results.append(score)
            if score["score"] is not None:
                print(f"  📊 Score: {score['score']} ({score['category']})")
    return results

def write_snapshot(results):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_PATH.write_text(json.dumps(results, indent=2))

if __name__ == "__main__":
    if "--once" in sys.argv:
        results = asyncio.run(run_etl())
        write_snapshot(results)
        print(f"\n✅ Wrote {len(results)} city scores to {SNAPSHOT_PATH}")
        print("\n📊 Summary:")
        for r in results:
            if r["score"] is not None:
                print(f"  {r['cityName']}: {r['score']} ({r['category']}) - {r['stationsSampled']} stations")
            else:
                print(f"  {r['cityName']}: ❌ No data")
