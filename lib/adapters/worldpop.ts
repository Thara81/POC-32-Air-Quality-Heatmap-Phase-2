// Server-side adapter for WorldPop's population statistics API
// (https://www.worldpop.org/sdi/introapi/ — REST API served from
// api.worldpop.org). Used to weight exposure scoring by how many people
// live inside a city's bounding box, not just the raw pollutant reading.
//
// WorldPop's "stats" endpoint runs an async job (submit -> poll -> result).
// We keep the polling short for a live dashboard and fall back to
// "unavailable" rather than blocking the UI indefinitely.

import { CityDef } from "../types";

const WORLDPOP_BASE = process.env.WORLDPOP_API_BASE ?? "https://api.worldpop.org/v1";
const DATASET = "wpgppop"; // WorldPop Global Project population dataset

export interface WorldPopResult {
  population: number | null;
  year: number | null;
  source: "worldpop" | "unavailable";
}

export async function fetchCityPopulation(city: CityDef): Promise<WorldPopResult> {
  try {
    const [minLon, minLat, maxLon, maxLat] = city.bbox;
    const geojson = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [minLon, minLat],
            [maxLon, minLat],
            [maxLon, maxLat],
            [minLon, maxLat],
            [minLon, minLat],
          ],
        ],
      },
    };

    const submitUrl = new URL(`${WORLDPOP_BASE}/services/stats`);
    submitUrl.searchParams.set("dataset", DATASET);
    submitUrl.searchParams.set("year", "2020");
    submitUrl.searchParams.set("geojson", JSON.stringify(geojson));
    submitUrl.searchParams.set("runasync", "true");

    const submitRes = await fetch(submitUrl.toString(), { next: { revalidate: 3600 } });
    if (!submitRes.ok) return { population: null, year: null, source: "unavailable" };
    const submitData = await submitRes.json();
    const taskId = submitData?.taskid;
    if (!taskId) return { population: null, year: null, source: "unavailable" };

    // Poll briefly — WorldPop stats jobs are usually fast for a single small bbox.
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise((r) => setTimeout(r, 1500));
      const pollRes = await fetch(`${WORLDPOP_BASE}/tasks/${taskId}`);
      if (!pollRes.ok) continue;
      const pollData = await pollRes.json();
      if (pollData?.status === "finished") {
        const total = pollData?.data?.total_population ?? null;
        return { population: total, year: 2020, source: total != null ? "worldpop" : "unavailable" };
      }
      if (pollData?.status === "failed") break;
    }
    return { population: null, year: null, source: "unavailable" };
  } catch {
    return { population: null, year: null, source: "unavailable" };
  }
}
