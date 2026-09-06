import { NextRequest, NextResponse } from "next/server";
import { getCity } from "@/lib/cities";
import { fetchStations, OpenAQConfigError, OpenAQUpstreamError } from "@/lib/adapters/openaq";
import { getMockStations } from "@/lib/mock-data";

export async function GET(req: NextRequest) {
  const cityId = req.nextUrl.searchParams.get("city");
  const city = cityId ? getCity(cityId) : undefined;
  if (!city) {
    return NextResponse.json({ error: "Unknown or missing ?city=" }, { status: 400 });
  }

  try {
    const stations = await fetchStations(city);
    if (stations.length === 0) {
      return NextResponse.json({ city: city.id, stations: getMockStations(city), source: "mock" });
    }
    return NextResponse.json({ city: city.id, stations });
  } catch (err) {
    if (err instanceof OpenAQConfigError) {
      return NextResponse.json({ city: city.id, stations: getMockStations(city), source: "mock" });
    }
    if (err instanceof OpenAQUpstreamError) {
      return NextResponse.json({ city: city.id, stations: getMockStations(city), source: "mock" });
    }
    return NextResponse.json({ error: "Unexpected error fetching stations" }, { status: 500 });
  }
}
