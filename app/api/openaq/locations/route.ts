import { NextRequest, NextResponse } from "next/server";
import { getCity } from "@/lib/cities";
import { fetchStations, OpenAQConfigError, OpenAQUpstreamError } from "@/lib/adapters/openaq";

export async function GET(req: NextRequest) {
  const cityId = req.nextUrl.searchParams.get("city");
  const city = cityId ? getCity(cityId) : undefined;
  if (!city) {
    return NextResponse.json({ error: "Unknown or missing ?city=" }, { status: 400 });
  }

  try {
    const stations = await fetchStations(city);
    return NextResponse.json({ city: city.id, stations });
  } catch (err) {
    if (err instanceof OpenAQConfigError) {
      return NextResponse.json({ error: err.message, code: "config" }, { status: 503 });
    }
    if (err instanceof OpenAQUpstreamError) {
      return NextResponse.json({ error: err.message, code: "upstream" }, { status: 502 });
    }
    return NextResponse.json({ error: "Unexpected error fetching stations" }, { status: 500 });
  }
}
