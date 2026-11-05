import "server-only";
import { createHash } from "node:crypto";
import type { ClientSession } from "mongoose";
import { Booking, Course, Department, Room, ScheduleBatch, Timetable } from "./models";
import { generateSchedule, allocationConflict, type Allocation, type ScheduleInput, type ScheduleResult, type TeachingRoom } from "./scheduler";
import { lusakaTime } from "./policy";
import { roomTransaction } from "./service";
import { HttpError } from "@/lib/server/http";
import { Assessment } from "./assessment-models";

export async function scheduleSnapshot(session?: ClientSession) {
  const roomRows = await Room.find().sort({ _id: 1 }).session(session ?? null).lean();
  const courseRows = await Course.find().sort({ _id: 1 }).session(session ?? null).lean();
  const departmentRows = await Department.find().sort({ _id: 1 }).session(session ?? null).lean();
  const timetableRows = await Timetable.find().sort({ _id: 1 }).session(session ?? null).lean();
  const bookingRows = await Booking.find({ status: { $in: ["pending", "confirmed"] }, endTime: { $gt: new Date() } }).sort({ _id: 1 }).session(session ?? null).lean();
  const assessmentRows = await Assessment.find({ status: "published", mode: "in_person", endTime: { $gt: new Date() } }).sort({ _id: 1 }).session(session ?? null).lean();
  const rooms: TeachingRoom[] = roomRows.map((room) => ({
    id: String(room._id), code: room.code, name: room.name, capacity: room.capacity, spaceType: room.spaceType,
    isAvailable: room.isAvailable, equipment: room.equipment,
    point: typeof room.latitude === "number" && typeof room.longitude === "number" ? { latitude: room.latitude, longitude: room.longitude } :
      room.location?.coordinates?.length === 2 ? { latitude: room.location.coordinates[1], longitude: room.location.coordinates[0] } : null,
  }));
  const allocations: Allocation[] = timetableRows.map((row) => ({
    id: String(row._id), academicYear: row.academicYear, semester: row.semester, department: String(row.department), course: String(row.course),
    room: String(row.room), cohort: row.cohort ?? "", lecturer: row.lecturer ?? "", dayOfWeek: row.dayOfWeek,
    startTime: row.startTime, endTime: row.endTime, classSize: row.classSize, requiredEquipment: row.requiredEquipment, roomType: row.roomType ?? undefined,
  }));
  const bookings = bookingRows.map((row) => {
    const start = lusakaTime(row.startTime), end = lusakaTime(row.endTime);
    return { room: String(row.room), dayOfWeek: start.day, startTime: start.time, endTime: end.time };
  });
  for (const row of assessmentRows) {
    const start = lusakaTime(row.startTime), end = lusakaTime(row.endTime);
    allocations.push({ id: `assessment:${row._id}`, course: String(row.course), department: String(row.department), room: String(row.room),
      cohort: row.cohort, lecturer: row.lecturer, academicYear: "", semester: "", dayOfWeek: start.day, startTime: start.time, endTime: end.time, classSize: row.classSize });
  }
  // Ignore scheduleVersion: the transaction itself increments it before this snapshot.
  const fingerprint = createHash("sha256").update(JSON.stringify({
    rooms, courses: courseRows, departments: departmentRows, timetable: timetableRows, bookings: bookingRows, assessments: assessmentRows,
  })).digest("hex");
  return { rooms, allocations, bookings, courses: courseRows, departments: departmentRows, fingerprint };
}
export async function previewSchedule(owner: string, input: ScheduleInput) {
  return roomTransaction([], async (session) => {
    const snapshot = await scheduleSnapshot(session);
    for (const demand of input.demands) {
      const course = snapshot.courses.find((course) => String(course._id) === demand.course);
      if (!course || String(course.department) !== demand.department ||
        !snapshot.departments.some((department) => String(department._id) === demand.department)) throw new HttpError(422, "Select a course in an existing department.");
    }
    const result = generateSchedule(input, snapshot.rooms, snapshot.allocations, snapshot.bookings);
    const expiresAt = new Date(Date.now() + 15 * 60000);
    const [batch] = await ScheduleBatch.create([{ owner, fingerprint: snapshot.fingerprint, result, expiresAt }], { session });
    return { previewId: String(batch._id), expiresAt, ...result };
  });
}
export async function commitSchedule(owner: string, previewId: string, allowPartial: boolean) {
  return roomTransaction([], async (session) => {
    const batch = await ScheduleBatch.findOne({ _id: previewId, owner }).session(session);
    if (!batch) throw new HttpError(404, "Timetable preview not found.");
    if (batch.status === "completed") return { created: batch.allocationIds.length, allocationIds: batch.allocationIds };
    if (batch.expiresAt <= new Date()) throw new HttpError(410, "Timetable preview expired. Generate a fresh preview.");
    const result = batch.result as ScheduleResult;
    if (!result.allocations.length) throw new HttpError(422, "No sessions could be allocated. Verify rooms and requirements.");
    if (result.unscheduled.length && !allowPartial) throw new HttpError(422, "Some sessions remain unallocated. Explicitly accept a partial draft or revise requirements.");
    const snapshot = await scheduleSnapshot(session);
    if (snapshot.fingerprint !== batch.fingerprint) throw new HttpError(409, "Campus data changed. Generate a fresh preview before saving.");
    const existing = [...snapshot.allocations];
    for (const row of result.allocations) {
      const conflict = allocationConflict(row, existing, snapshot.rooms, snapshot.bookings);
      if (conflict) throw new HttpError(409, conflict);
      existing.push(row);
    }
    const records = await Timetable.create(result.allocations.map(({ demandIndex, sessionNumber, ...row }) => ({
      ...row, status: "draft", notes: `Smart allocation: demand ${demandIndex + 1}, session ${sessionNumber}. Verify estimated walking routes before publication.`,
    })), { session, ordered: true });
    batch.status = "completed";
    batch.allocationIds = records.map((record) => record._id);
    await batch.save({ session });
    return { created: records.length, allocationIds: batch.allocationIds };
  });
}
