import { CityDef, MeasurementPoint, PollutantCode, StationLocation } from "./types";

const BASE_VALUES: Record<PollutantCode, number> = {
  pm25: 34,
  pm10: 58,
  no2: 27,
  o3: 46,
  so2: 11,
  co: 720,
};

const CITY_FACTORS: Record<string, number> = {
  delhi: 2.7,
  "los-angeles": 1.25,
  london: 0.8,
  jakarta: 1.55,
  lagos: 1.75,
  warsaw: 1.05,
  "sao-paulo": 1.2,
  beijing: 2.15,
};

export function getMockStations(city: CityDef): StationLocation[] {
  const offsets = [
    [-0.06, 0.04],
    [0.04, 0.03],
    [-0.03, -0.05],
    [0.07, -0.02],
    [0, 0.07],
  ];

  return offsets.map(([lonOffset, latOffset], index) => ({
    id: -(city.id.length * 100 + index + 1),
    name: `${city.name} sample station ${index + 1}`,
    lat: city.lat + latOffset,
    lon: city.lon + lonOffset,
    provider: "Local sample network",
    parameters: ["pm25", "pm10", "no2", "o3", "so2", "co"],
    lastUpdated: new Date(Date.now() - index * 45 * 60 * 1000).toISOString(),
  }));
}

export function getMockMeasurements(
  locationId: number,
  parameter: PollutantCode,
  daysBack: number
): MeasurementPoint[] {
  const factor = 1 + (Math.abs(locationId) % 5) * 0.06;
  const cityFactor = Object.values(CITY_FACTORS)[Math.abs(locationId) % Object.values(CITY_FACTORS).length];
  const pointCount = Math.max(12, Math.min(48, Math.round(daysBack * 6)));
  const interval = (daysBack * 24 * 60 * 60 * 1000) / pointCount;
  const now = Date.now();

  return Array.from({ length: pointCount }, (_, index) => {
    const wave = 1 + Math.sin(index / 2.3) * 0.14;
    const value = BASE_VALUES[parameter] * cityFactor * factor * wave;
    return {
      datetime: new Date(now - (pointCount - index) * interval).toISOString(),
      value: Number(value.toFixed(2)),
      unit: "µg/m³",
    };
  });
}