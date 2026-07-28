import asyncio
import json
import os
import time
from pathlib import Path
import httpx

OPENAQ_BASE = "https://api.openaq.org/v3"
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

POLLUTANTS = ["pm25", "pm10", "no2", "o3", "so2", "co"]
WHO_GUIDELINE = {"pm25": 5.0, "pm10": 15.0, "no2": 10.0, "o3": 100.0, "so2": 40.0, "co": 4.0}

def compute_score(city_id, parameter, mean, unit, population):
    guideline = WHO_GUIDELINE.get(parameter, 10)
    if mean is None:
        return {"score": None, "category": None, "meanConcentration": None, "ratioToGuideline": None}
    ratio = mean / guideline
    score = round(100 * (1 - 1 / (1 + max(ratio - 1, 0))))
    category = "Low" if score < 25 else "Moderate" if score < 50 else "High" if score < 75 else "Severe"
    return {"score": score, "category": category, "meanConcentration": mean, "ratioToGuideline": round(ratio, 2)}

async def fetch_city_data(client, api_key, city):
    headers = {"X-API-Key": api_key}
    results = {}
    
    print(f"\n📍 Processing {city['name']}...")
    
    # Get locations with a small delay to avoid rate limits
    await asyncio.sleep(0.5)
    
    resp = await client.get(
        f"{OPENAQ_BASE}/locations",
        params={"bbox": ",".join(map(str, city["bbox"])), "limit": 50},
        headers=headers
    )
    if resp.status_code != 200:
        print(f"  ❌ Failed: {resp.status_code}")
        return results
    
    stations = resp.json().get("results", [])
    print(f"  📊 Found {len(stations)} stations")
    
    # For each pollutant, find stations with that sensor
    for param in POLLUTANTS:
        param_data = []
        sensor_ids = []
        
        # Find sensors for this pollutant
        for s in stations[:10]:  # Limit to first 10 stations to avoid rate limits
            for sensor in s.get("sensors", []):
                if sensor.get("parameter", {}).get("name") == param:
                    sensor_ids.append(sensor["id"])
                    break
        
        if not sensor_ids:
            print(f"  ⚠️ {param}: No sensors found")
            results[param] = {"mean": None, "unit": "µg/m³", "count": 0}
            continue
        
        # Get measurements from up to 3 sensors
        for sensor_id in sensor_ids[:3]:
            await asyncio.sleep(0.3)  # Small delay between requests
            try:
                m_resp = await client.get(
                    f"{OPENAQ_BASE}/sensors/{sensor_id}/measurements",
                    params={"limit": 20, "sort": "desc"},
                    headers=headers,
                    timeout=10.0
                )
                if m_resp.status_code == 200:
                    measurements = m_resp.json().get("results", [])
                    for m in measurements[:15]:
                        if m.get("value") is not None and m["value"] > 0:
                            param_data.append(m["value"])
                    if param_data:
                        print(f"    ✅ {param}: sensor {sensor_id} - {len(measurements)} readings")
            except Exception as e:
                print(f"    ⚠️ {param}: sensor {sensor_id} failed")
                continue
        
        if param_data:
            mean = sum(param_data) / len(param_data)
            print(f"  ✅ {param}: {mean:.1f} from {len(param_data)} readings")
            results[param] = {"mean": mean, "unit": "µg/m³", "count": len(param_data)}
        else:
            print(f"  ⚠️ {param}: No data")
            results[param] = {"mean": None, "unit": "µg/m³", "count": 0}
    
    return results

async def main():
    api_key = os.environ.get("OPENAQ_API_KEY")
    if not api_key:
        print("❌ OPENAQ_API_KEY not set")
        return
    
    print("🚀 Fetching ALL pollutants from OpenAQ (slow mode)...")
    all_results = []
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        for city in CITIES:
            data = await fetch_city_data(client, api_key, city)
            
            for param, values in data.items():
                score_data = compute_score(city["id"], param, values["mean"], values["unit"], None)
                all_results.append({
                    "cityId": city["id"],
                    "cityName": city["name"],
                    "country": city["country"],
                    "parameter": param,
                    "meanConcentration": values["mean"],
                    "unit": values["unit"],
                    "whoGuideline": WHO_GUIDELINE.get(param, 10),
                    "ratioToGuideline": score_data.get("ratioToGuideline"),
                    "population": None,
                    "score": score_data.get("score"),
                    "category": score_data.get("category"),
                    "peopleAboveGuideline": None,
                    "computedAt": "2026-07-17T12:00:00+00:00",
                    "dataQuality": "live" if values["mean"] else "unavailable",
                    "stationsSampled": values["count"] if values["mean"] else 0
                })
            
            # Wait between cities to avoid rate limits
            print(f"  ⏳ Waiting 2 seconds before next city...")
            await asyncio.sleep(2)
    
    # Write snapshot
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_PATH.write_text(json.dumps(all_results, indent=2))
    
    print(f"\n✅ Done! Saved {len(all_results)} entries to {SNAPSHOT_PATH}")
    print("\n📊 Summary by city:")
    for city in CITIES:
        city_data = [r for r in all_results if r["cityId"] == city["id"] and r["score"] is not None]
        if city_data:
            print(f"  ✅ {city['name']}: {len(city_data)} pollutants with data")
        else:
            print(f"  ❌ {city['name']}: No data")

if __name__ == "__main__":
    asyncio.run(main())
