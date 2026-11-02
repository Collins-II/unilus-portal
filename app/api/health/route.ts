import { connectToDatabase } from "@/lib/database";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectToDatabase();
    await mongoose.connection.db?.admin().ping();
    return Response.json({ ok: true, database: "up" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, database: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
