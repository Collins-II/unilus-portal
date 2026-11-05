import { requireStaff } from "@/lib/server/auth";
import { handler, readJson } from "@/lib/server/http";
import { Assessment, AssessmentAttempt } from "@/lib/campus/assessment-models";
import { saveAssessment } from "@/lib/campus/assessment-service";
import { connectToDatabase } from "@/lib/database";
import { objectId } from "@/lib/campus/policy";
import { z } from "zod";

export const GET = handler(async () => {
  await requireStaff();
  await connectToDatabase();
  const records = await Assessment.find().sort({ startTime: -1 }).lean();
  const results = await AssessmentAttempt.find({ submittedAt: { $ne: null } }).populate("student", "studentId name").select("assessment student score maximum submittedAt").lean();
  return { records, results };
});
export const POST = handler(async (request: Request) => {
  await requireStaff("admin");
  return saveAssessment(await readJson(request));
});
export const PATCH = handler(async (request: Request) => {
  await requireStaff("admin");
  const { _id, ...data } = z.record(z.string(), z.unknown()).parse(await readJson(request));
  return saveAssessment(data, objectId.parse(_id));
});
