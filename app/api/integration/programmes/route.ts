import { handler } from "@/lib/server/http";
import { connectToDatabase } from "@/lib/database";
import { requireIntegration } from "@/lib/campus/service";
import { Programme } from "@/lib/campus/models";

export const GET = handler(async (request: Request) => {
  requireIntegration(request);
  await connectToDatabase();
  return { programmes: await Programme.find().populate("department", "code name").select("code name department campus").sort({ name: 1 }).lean() };
});
