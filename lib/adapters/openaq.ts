// Server-side adapter for the OpenAQ v3 API (https://docs.openaq.org).
import { CityDef, MeasurementPoint, PollutantCode, StationLocation } from "../types";

const OPENAQ_BASE = "https://api.openaq.org/v3";

const SUPPORTED_PARAMETERS = new Set<PollutantCode>(["pm25", "pm10", "no2", "o3", "so2", "co"]);

function normalizeToUgM3(value: number, unit: string | undefined): number | null {
  if (!Number.isFinite(value)) return null;
  const u = (unit ?? "").trim().toLowerCase().replace(/μ|µ/g, "u");
  if (u === "ug/m3" || u === "ug/m³") return value;
  if (u === "mg/m3" || u === "mg/m³") return value * 1000;
  console.warn("Unrecognized unit, dropping value:", unit);
  return null;
}

function rejectOutliers(values: number[]): number[] {
  if (values.length < 4) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = values.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)] || 1e-9;
  const filtered = values.filter((v) => Math.abs(v - median) / mad <= 3.5);
  return filtered.length > 0 ? filtered : values;
}

const sensorIdsByLocation = new Map<number, Partial<Record<PollutantCode, number>>>();

function apiKey(): string {
  const key = process.env.OPENAQ_API_KEY;
  if (!key) {
    throw new OpenAQConfigError(
      "OPENAQ_API_KEY is not set. Get a free key at https://explore.openaq.org/register and add it to .env.local."
    );
  }
  return key;
}

export class OpenAQConfigError extends Error {}
export class OpenAQUpstreamError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function openaqFetch(path: string, params: Record<string, string>) {
  const url = new URL(`${OPENAQ_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { "X-API-Key": apiKey() },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown network error";
    throw new OpenAQUpstreamError(`OpenAQ request could not be completed: ${detail}`, 504);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OpenAQUpstreamError(`OpenAQ request failed (${res.status}): ${body.slice(0, 300)}`, res.status);
  }
  return res.json();
}

export async function fetchStations(city: CityDef): Promise<StationLocation[]> {
  const data = await openaqFetch("/locations", {
    bbox: city.bbox.join(","),
    limit: "50",
  });

  const results: any[] = data?.results ?? [];
  return results.map((loc) => {
    const sensorIds = (loc.sensors ?? []).reduce(
      (ids: Partial<Record<PollutantCode, number>>, sensor: any) => {
        const name = sensor.parameter?.name;
        if (typeof sensor.id === "number" && name && SUPPORTED_PARAMETERS.has(name as PollutantCode)) {
          ids[name as PollutantCode] ??= sensor.id;
        }
        return ids;
      },
      {}
    );
    sensorIdsByLocation.set(loc.id, sensorIds);

    return {
      id: loc.id,
      name: loc.name ?? `Station ${loc.id}`,
      lat: loc.coordinates?.latitude ?? loc.latitude ?? city.lat,
      lon: loc.coordinates?.longitude ?? loc.longitude ?? city.lon,
      provider: loc.provider?.name ?? loc.owner?.name ?? "Unknown network",
      parameters: Object.keys(sensorIds) as PollutantCode[],
      lastUpdated: loc.datetimeLast?.utc ?? null,
    };
  });
}

export async function fetchMeasurements(
  locationId: number,
  parameter: PollutantCode,
  daysBack = 7
): Promise<MeasurementPoint[]> {
  const dateTo = new Date();
  const dateFrom = new Date(dateTo.getTime() - daysBack * 24 * 60 * 60 * 1000);

  let sensorId = sensorIdsByLocation.get(locationId)?.[parameter];
  if (!sensorId) {
    const sensorData = await openaqFetch(`/locations/${locationId}/sensors`, {});
    const sensor = (sensorData?.results ?? [])
      .filter((candidate: any) => candidate.parameter?.name === parameter)
      .sort((a: any, b: any) =>
        String(b.datetimeLast?.utc ?? "").localeCompare(String(a.datetimeLast?.utc ?? ""))
      )[0];
    if (!sensor) return [];
    sensorId = sensor.id;
  }

  const data = await openaqFetch(`/sensors/${sensorId}/measurements`, {
    datetime_from: dateFrom.toISOString(),
    datetime_to: dateTo.toISOString(),
    limit: "500",
  });

  const results: any[] = data?.results ?? [];
  return results
    .map((m) => {
      const normalized = normalizeToUgM3(m.value, m.parameter?.units);
      return {
        datetime: m.period?.datetimeFrom?.utc,
        value: normalized,
        unit: "µg/m³",
      };
    })
    .filter(
      (m): m is MeasurementPoint =>
        typeof m.datetime === "string" && m.value != null && Number.isFinite(m.value) && m.value >= 0
    )
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
}

export async function fetchCityMeanConcentration(
  city: CityDef,
  parameter: PollutantCode
): Promise<{ mean: number | null; unit: string; sampleStations: number }> {
  const stations = await fetchStations(city);
  let relevant = stations.filter((s) => s.parameters.includes(parameter)).slice(0, 6);
  if (relevant.length === 0) {
    relevant = stations.slice(0, 6);
  }

  const seriesList = await Promise.all(
    relevant.map((s) =>
      fetchMeasurements(s.id, parameter, 2).catch((err) => {
        console.error(`measurements fail station ${s.id}:`, err);
        return [] as MeasurementPoint[];
      })
    )
  );
  const allValues = seriesList.flat().map((p) => p.value);
  if (allValues.length === 0) return { mean: null, unit: "µg/m³", sampleStations: relevant.length };

  const clean = rejectOutliers(allValues);
  const mean = clean.reduce((sum, v) => sum + v, 0) / clean.length;
  return { mean, unit: "µg/m³", sampleStations: relevant.length };
}