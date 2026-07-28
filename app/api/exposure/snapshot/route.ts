import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const snapshotPath = path.join(process.cwd(), "data", "exposure_scores.json");
    
    if (!fs.existsSync(snapshotPath)) {
      return NextResponse.json({ error: "No snapshot available. Run ETL first." }, { status: 404 });
    }
    
    const data = fs.readFileSync(snapshotPath, "utf-8");
    const scores = JSON.parse(data);
    
    return NextResponse.json(scores);
  } catch (error) {
    return NextResponse.json({ error: "Failed to read snapshot" }, { status: 500 });
  }
}
