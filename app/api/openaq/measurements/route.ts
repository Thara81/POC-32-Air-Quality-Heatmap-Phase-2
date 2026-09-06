import { NextRequest, NextResponse } from "next/server";
import { fetchMeasurements, OpenAQConfigError, OpenAQUpstreamError } from "@/lib/adapters/openaq";
import { PollutantCode } from "@/lib/types";
import { getMockMeasurements } from "@/lib/mock-data";

export async function GET(req: NextRequest) {
  const locationId = Number(req.nextUrl.searchParams.get("locationId"));
  const parameter = req.nextUrl.searchParams.get("parameter") as PollutantCode | null;
  const daysBack = Number(req.nextUrl.searchParams.get("daysBack") ?? "7");

  if (!locationId || !parameter) {
    return NextResponse.json({ error: "Requires ?locationId= and ?parameter=" }, { status: 400 });
  }

  try {
    const points = await fetchMeasurements(locationId, parameter, daysBack);
    if (points.length === 0) {
      return NextResponse.json({ locationId, parameter, points: getMockMeasurements(locationId, parameter, daysBack), source: "mock" });
    }
    return NextResponse.json({ locationId, parameter, points });
  } catch (err) {
    if (err instanceof OpenAQConfigError) {
      return NextResponse.json({ locationId, parameter, points: getMockMeasurements(locationId, parameter, daysBack), source: "mock" });
    }
    if (err instanceof OpenAQUpstreamError) {
      return NextResponse.json({ locationId, parameter, points: getMockMeasurements(locationId, parameter, daysBack), source: "mock" });
    }
    return NextResponse.json({ error: "Unexpected error fetching measurements" }, { status: 500 });
  }
}
