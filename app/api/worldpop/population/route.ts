import { NextRequest, NextResponse } from "next/server";
import { getCity } from "@/lib/cities";
import { fetchCityPopulation } from "@/lib/adapters/worldpop";

export async function GET(req: NextRequest) {
  const cityId = req.nextUrl.searchParams.get("city");
  const city = cityId ? getCity(cityId) : undefined;
  if (!city) {
    return NextResponse.json({ error: "Unknown or missing ?city=" }, { status: 400 });
  }

  const result = await fetchCityPopulation(city);
  return NextResponse.json({ city: city.id, ...result });
}
