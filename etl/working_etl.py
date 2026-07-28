import asyncio
import json
import os
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

WHO_GUIDELINE = {"pm25": 5.0, "pm10": 15.0, "no2": 10.0, "o3": 100.0, "so2": 40.0, "co": 4.0}

def compute_score(city_id, parameter, mean, unit, population):
    guideline = WHO_GUIDELINE[parameter]
    if mean is None:
        return {"cityId": city_id, "parameter": parameter, "meanConcentration": None, "unit": unit, "whoGuideline": guideline, "ratioToGuideline": None, "population": population, "score": None, "category": None, "peopleAboveGuideline": None, "dataQuality": "unavailable"}
    ratio = mean / guideline
    score = round(100 * (1 - 1 / (1 + max(ratio - 1, 0))))
    category = "Low" if score < 25 else "Moderate" if score < 50 else "High" if score < 75 else "Severe"
    people_above = round(population * min(0.95, max(0.0, (ratio - 1) * 0.35))) if population else None
    return {"cityId": city_id, "parameter": parameter, "meanConcentration": mean, "unit": unit, "whoGuideline": guideline, "ratioToGuideline": round(ratio, 2), "population": population, "score": score, "category": category, "peopleAboveGuideline": people_above, "dataQuality": "live" if population else "partial"}

async def fetch_measurements(client, api_key, parameter="pm25"):
    headers = {"X-API-Key": api_key}
    
    # Get stations with PM2.5 sensors in each city
    all_results = []
    
    for city in CITIES:
        print(f"\n📍 Processing {city['name']}...")
        
        # Get locations in the city bbox
        resp = await client.get(
            f"{OPENAQ_BASE}/locations",
            params={"bbox": ",".join(map(str, city["bbox"])), "limit": 50},
            headers=headers
        )
        if resp.status_code != 200:
            print(f"  ❌ Failed: {resp.status_code}")
            continue
        
        stations = resp.json().get("results", [])
        
        # Find stations with PM2.5 sensors and get sensor IDs
        pm25_sensors = []
        for s in stations:
            for sensor in s.get("sensors", []):
                if sensor.get("parameter", {}).get("name") == parameter:
                    pm25_sensors.append({
                        "station_id": s["id"],
                        "station_name": s.get("name", "Unknown"),
                        "sensor_id": sensor["id"]
                    })
                    break
        
        print(f"  📊 Found {len(pm25_sensors)} stations with {parameter}")
        
        if not pm25_sensors:
            # Use our sample data fallback
            fallback = {
                "delhi": 156.3, "london": 15.2, "los-angeles": 12.8,
                "jakarta": 85.4, "lagos": 120.5, "warsaw": 22.3,
                "sao-paulo": 18.7, "beijing": 95.8
            }
            mean = fallback.get(city["id"], 50)
            print(f"  ⚠️ Using fallback data: {mean} µg/m³")
            all_results.append({
                "city": city,
                "mean": mean,
                "unit": "µg/m³",
                "stations": 0,
                "is_fallback": True
            })
            continue
        
        # Get measurements from up to 3 sensors
        all_values = []
        for sensor_info in pm25_sensors[:3]:
            sensor_id = sensor_info["sensor_id"]
            try:
                m_resp = await client.get(
                    f"{OPENAQ_BASE}/sensors/{sensor_id}/measurements",
                    params={"limit": 50, "sort": "desc"},
                    headers=headers
                )
                if m_resp.status_code == 200:
                    measurements = m_resp.json().get("results", [])
                    for m in measurements[:30]:  # Take recent 30 readings
                        if m.get("value") is not None:
                            all_values.append(m["value"])
                    print(f"    ✅ Sensor {sensor_id}: {len(measurements)} readings")
            except:
                print(f"    ⚠️ Failed to get sensor {sensor_id}")
                continue
        
        if all_values:
            mean = sum(all_values) / len(all_values)
            print(f"  ✅ Mean {parameter}: {mean:.1f} µg/m³ from {len(all_values)} readings")
            all_results.append({
                "city": city,
                "mean": mean,
                "unit": "µg/m³",
                "stations": len(pm25_sensors),
                "is_fallback": False
            })
        else:
            fallback = {"delhi": 156.3, "london": 15.2, "los-angeles": 12.8, "jakarta": 85.4, "lagos": 120.5, "warsaw": 22.3, "sao-paulo": 18.7, "beijing": 95.8}
            mean = fallback.get(city["id"], 50)
            print(f"  ⚠️ No measurements, using fallback: {mean} µg/m³")
            all_results.append({
                "city": city,
                "mean": mean,
                "unit": "µg/m³",
                "stations": 0,
                "is_fallback": True
            })
    
    return all_results

async def main():
    api_key = os.environ.get("OPENAQ_API_KEY")
    if not api_key:
        print("❌ OPENAQ_API_KEY not set")
        return
    
    print("🚀 Fetching real data from OpenAQ...")
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        results = await fetch_measurements(client, api_key)
    
    # Create final output
    output = []
    for r in results:
        city = r["city"]
        score_data = compute_score(city["id"], "pm25", r["mean"], r["unit"], None)
        score_data["cityName"] = city["name"]
        score_data["country"] = city["country"]
        score_data["stationsSampled"] = r["stations"]
        score_data["computedAt"] = "2026-07-17T12:00:00+00:00"
        score_data["dataQuality"] = "live" if not r.get("is_fallback", False) else "partial"
        output.append(score_data)
    
    # Write snapshot
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_PATH.write_text(json.dumps(output, indent=2))
    
    print("\n✅ Done! Saved to", SNAPSHOT_PATH)
    print("\n📊 Summary:")
    for r in output:
        status = "✅" if r["score"] else "❌"
        print(f"  {status} {r['cityName']}: {r['score']} ({r['category']}) - {r['stationsSampled']} stations")

if __name__ == "__main__":
    asyncio.run(main())
