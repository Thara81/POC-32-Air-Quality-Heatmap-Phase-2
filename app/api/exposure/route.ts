import { NextRequest, NextResponse } from "next/server";
import { getCity } from "@/lib/cities";
import { fetchCityMeanConcentration, OpenAQConfigError } from "@/lib/adapters/openaq";
import { fetchCityPopulation } from "@/lib/adapters/worldpop";
import { computeExposureScore } from "@/lib/exposure";
import { PollutantCode } from "@/lib/types";

export async function GET(req: NextRequest) {
  const cityId = req.nextUrl.searchParams.get("city");
  const parameter = (req.nextUrl.searchParams.get("parameter") ?? "pm25") as PollutantCode;
  const city = cityId ? getCity(cityId) : undefined;

  if (!city) {
    return NextResponse.json({ error: "Unknown or missing ?city=" }, { status: 400 });
  }

  try {
    const [concentration, population] = await Promise.all([
      fetchCityMeanConcentration(city, parameter),
      fetchCityPopulation(city),
    ]);

    const result = computeExposureScore(city.id, parameter, concentration.mean, population.population);

    return NextResponse.json({
      ...result,
      populationSource: population.source,
      stationsSampled: concentration.sampleStations,
    });
  } catch (err) {
    if (err instanceof OpenAQConfigError) {
      return NextResponse.json({ error: err.message, code: "config" }, { status: 503 });
    }
    return NextResponse.json({ error: "Unexpected error computing exposure score" }, { status: 500 });
  }
}
