import { z } from "zod";
import { requireStaff } from "@/lib/server/auth";
import { handler, rateLimit, readJson } from "@/lib/server/http";
import { objectId } from "@/lib/campus/policy";
import { scheduleInput } from "@/lib/campus/scheduler";
import { commitSchedule, previewSchedule } from "@/lib/campus/schedule-service";

export const POST = handler(async (request: Request) => {
  const staff = await requireStaff("admin");
  rateLimit(`schedule:${staff.id}`, 10, 60000);
  return previewSchedule(staff.id, scheduleInput.parse(await readJson(request)));
});
export const PATCH = handler(async (request: Request) => {
  const staff = await requireStaff("admin");
  rateLimit(`schedule:${staff.id}`, 10, 60000);
  const input = z.object({ previewId: objectId, allowPartial: z.boolean().default(false) }).strict().parse(await readJson(request));
  return commitSchedule(staff.id, input.previewId, input.allowPartial);
});
