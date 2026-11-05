import "server-only";
import { timingSafeEqual } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import { connectToDatabase } from "@/lib/database";
import { HttpError } from "@/lib/server/http";
import { Booking, Room, Student, Timetable } from "./models";
import { bookingPolicy, lusakaTime, overlaps, type BookingInput } from "./policy";
import { Assessment } from "./assessment-models";

export function requireIntegration(request: Request) {
  const expected = process.env.STUDENT_APP_API_KEY;
  if (!expected) throw new HttpError(503, "Student integration is not configured.");
  const received = request.headers.get("x-student-app-key") || "";
  const a = Buffer.from(expected), b = Buffer.from(received);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, "Invalid student application key.");
}
export async function activeStudent(studentId: string) {
  await connectToDatabase();
  const student = await Student.findOne({ studentId: studentId.trim().toUpperCase(), role: "student", status: "active" });
  if (!student) throw new HttpError(404, "Active student account not found.", "STUDENT_NOT_FOUND");
  return student;
}

// All booking and timetable mutations write the room first, serializing competing transactions.
export async function roomTransaction<T>(roomIds: string[], operation: (session: ClientSession) => Promise<T>) {
  await connectToDatabase();
  // A shared write lock also prevents concurrent lecturer/cohort conflicts across different rooms.
  const locks = mongoose.connection.collection("campusschedulelocks");
  const lockId = new mongoose.Types.ObjectId("000000000000000000000001");
  await locks.updateOne({ _id: lockId }, { $setOnInsert: { version: 0 } }, { upsert: true });
  return mongoose.connection.transaction(async (session) => {
    await locks.updateOne({ _id: lockId }, { $inc: { version: 1 } }, { session });
    for (const id of [...new Set(roomIds)].sort()) {
      const room = await Room.findByIdAndUpdate(id, { $inc: { scheduleVersion: 1 } }, { session, new: true });
      if (!room) throw new HttpError(404, "Room not found.");
    }
    return operation(session);
  });
}
export async function validateBooking(input: BookingInput, session: ClientSession, excludeId?: string, approving = false) {
  if (!approving) {
    const error = bookingPolicy(input);
    if (error) throw new HttpError(422, error);
  } else if (input.startTime <= new Date()) throw new HttpError(409, "Past bookings cannot be approved.");
  const room = await Room.findById(input.roomId).session(session);
  if (!room || !room.isAvailable || room.spaceType !== "lecture_room") throw new HttpError(409, "This lecture room is unavailable.");
  if (input.attendees > (room.capacity || 0)) throw new HttpError(422, "Attendees exceed the room capacity.");
  const conflict = await Booking.exists({
    room: input.roomId, status: { $in: ["pending", "confirmed"] },
    startTime: { $lt: input.endTime }, endTime: { $gt: input.startTime },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).session(session);
  if (conflict) throw new HttpError(409, "This room already has a booking during that time.");
  if (await Assessment.exists({ room: input.roomId, status: "published", startTime: { $lt: input.endTime }, endTime: { $gt: input.startTime } }).session(session)) throw new HttpError(409, "This room is reserved for an assessment.");
  const local = lusakaTime(input.startTime), end = lusakaTime(input.endTime);
  const rows = await Timetable.find({ room: input.roomId, status: "published", dayOfWeek: local.day }).session(session);
  if (rows.some((row) => overlaps(local.time, end.time, row.startTime, row.endTime))) {
    throw new HttpError(409, "This request conflicts with the published timetable.");
  }
}
