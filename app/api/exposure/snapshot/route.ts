import { NextResponse } from "next/server";

export async function GET() {
  try {
    const backendUrl = process.env.FASTAPI_BASE_URL;

    if (!backendUrl) {
      return NextResponse.json(
        { error: "FASTAPI_BASE_URL is not configured" },
        { status: 500 }
      );
    }

    const response = await fetch(`${backendUrl}/snapshot`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch snapshot from backend" },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("Snapshot fetch error:", error);

    return NextResponse.json(
      { error: "Failed to fetch snapshot" },
      { status: 500 }
    );
  }
}