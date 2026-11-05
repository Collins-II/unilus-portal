import { z } from "zod";
import { handler, readJson } from "@/lib/server/http";
import { requireIntegration, activeStudent } from "@/lib/campus/service";
import { attemptAction, studentAssessments } from "@/lib/campus/assessment-service";

export const GET = handler(async (request: Request) => {
  requireIntegration(request);
  const student = await activeStudent(z.string().min(1).max(30).parse(new URL(request.url).searchParams.get("studentId")));
  return studentAssessments({ id: String(student._id) });
});
export const POST = handler(async (request: Request) => {
  requireIntegration(request);
  const { studentId, ...raw } = z.record(z.string(), z.unknown()).parse(await readJson(request));
  const student = await activeStudent(z.string().min(1).max(30).parse(studentId));
  return studentAssessments({ id: String(student._id) }, attemptAction.parse(raw));
});
