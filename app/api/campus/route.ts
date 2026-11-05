import { requireStaff } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { Announcement, Booking, Course, Department, Programme, Room, Student, Timetable } from "@/lib/campus/models";

export const dynamic = "force-dynamic";
export const GET = handler(async () => {
  const staff = await requireStaff();
  const [rooms, departments, courses, timetable, announcements, students, bookings, programmes] = await Promise.all([
    Room.find().sort({ code: 1 }).lean(),
    Department.find().sort({ code: 1 }).lean(),
    Course.find().populate("department", "code name").sort({ code: 1 }).lean(),
    Timetable.find().populate("department", "code name").populate("course", "code title").populate("room", "name code building spaceType latitude longitude").sort({ dayOfWeek: 1, startTime: 1 }).lean(),
    Announcement.find().sort({ createdAt: -1 }).lean(),
    Student.find({ role: "student" }).select("studentId name email department program campus year phone status passwordSetupRequired").sort({ studentId: 1 }).lean(),
    Booking.find().populate("user", "studentId name").populate("room", "name code building").sort({ startTime: -1 }).lean(),
    Programme.find().populate("department", "code name").sort({ code: 1 }).lean(),
  ]);
  return { staff, rooms, departments, courses, timetable, announcements, students, bookings, programmes, integrationConfigured: Boolean(process.env.STUDENT_APP_API_KEY) };
});
