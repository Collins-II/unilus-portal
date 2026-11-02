import { handler } from "@/lib/server/http";
import { connectToDatabase } from "@/lib/database";
import { Announcement, Department, Timetable } from "@/lib/campus/models";
import { requireIntegration } from "@/lib/campus/service";

export const dynamic = "force-dynamic";
export const GET = handler(async (request: Request) => {
  requireIntegration(request);
  await connectToDatabase();
  const [timetable, announcements, departments] = await Promise.all([
    Timetable.find({ status: "published" }).populate("department", "code name").populate("course", "code title").populate("room", "name building").sort({ dayOfWeek: 1, startTime: 1 }).lean(),
    Announcement.find({ status: "published" }).select("title message priority createdAt").sort({ createdAt: -1 }).lean(),
    Department.find().select("code name").sort({ code: 1 }).lean(),
  ]);
  return { timetable, announcements, departments };
});
