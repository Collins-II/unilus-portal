import { z } from "zod";
import { campusFor, campusIds } from "./geography.ts";
import { hasTeachingProperties } from "./location-properties.ts";

const text = (max: number) => z.string().trim().min(1).max(max);
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid record ID.");
export const code = text(30).transform((value) => value.toUpperCase());
export const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24-hour time).");
export const tutorialGroupSchema = z.object({
  groupName: text(120), courseCode: code, topic: text(1000), leaderName: text(120),
});
export const bookingSchema = z.object({
  roomId: objectId, purpose: z.enum(["Tutorial Group", "Event"]), title: text(120),
  tutorialGroup: tutorialGroupSchema.optional(), attendees: z.number().int().min(1).max(10000),
  conversationId: objectId.nullish(),
  startTime: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  endTime: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
}).strict();
export type BookingInput = z.infer<typeof bookingSchema>;

export function bookingPolicy(input: BookingInput, now = Date.now()): string | null {
  if (input.endTime <= input.startTime) return "End time must be after start time.";
  if (input.purpose === "Tutorial Group" && !input.tutorialGroup) return "Tutorial group details are required.";
  const notice = input.startTime.getTime() - now;
  const hour = 3600000;
  if (input.purpose === "Tutorial Group" && notice < 48 * hour) return "Tutorial groups require at least 48 hours notice.";
  if (input.purpose === "Event" && (notice < 7 * 24 * hour || notice > 14 * 24 * hour)) return "Events must be requested 7–14 days in advance.";
  const start = lusakaTime(input.startTime);
  const end = lusakaTime(input.endTime);
  if (start.date !== end.date || start.time < "07:00" || end.time > "21:00") return "Bookings must be on one campus day between 07:00 and 21:00 (Africa/Lusaka).";
  return null;
}

export function lusakaTime(date: Date) {
  const local = new Date(date.getTime() + 2 * 3600000);
  return { date: local.toISOString().slice(0, 10), day: local.getUTCDay(), time: local.toISOString().slice(11, 16) };
}
export function overlaps(start: string, end: string, otherStart: string, otherEnd: string) {
  return start < otherEnd && end > otherStart;
}

const status = z.enum(["draft", "published"]);
export const resourceSchemas = {
  rooms: z.object({
    name: text(120), code, building: text(120), floor: z.number().int().min(-10).max(200).default(0),
    capacity: z.number().int().min(0).max(10000).default(0),
    spaceType: z.enum(["lecture_room", "laboratory", "seminar_room", "office", "library", "clinic", "cafeteria", "residence", "administrative", "other"]),
    latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
    description: z.string().trim().max(2000).default(""),
    equipment: z.array(text(100)).max(50).default([]), isAvailable: z.boolean(),
  }).strict().refine((room) => Boolean(campusFor(room)), { message: "Choose coordinates inside a supported UNILUS navigation scope." })
    .transform((room) => hasTeachingProperties(room.spaceType) ? room : { ...room, capacity: 0, equipment: [] }),
  departments: z.object({ code, name: text(120) }).strict(),
  courses: z.object({ code, title: text(160), department: objectId }).strict(),
  programmes: z.object({ code, name: text(160), department: objectId, campus: z.enum(campusIds) }).strict(),
  timetable: z.object({
    academicYear: text(30), semester: text(30), department: objectId, course: objectId, room: objectId,
    cohort: text(100), lecturer: text(120), dayOfWeek: z.number().int().min(0).max(6),
    startTime: time, endTime: time, notes: z.string().trim().max(2000).default(""), status,
    classSize: z.number().int().min(0).max(10000).default(0),
    requiredEquipment: z.array(text(100)).max(20).default([]),
    roomType: z.enum(["lecture_room", "laboratory", "seminar_room"]).optional(),
  }).strict().refine((value) => value.startTime < value.endTime, { message: "End time must be after start time." }),
  announcements: z.object({ title: text(160), message: text(5000), priority: z.enum(["normal", "important", "urgent"]), status }).strict(),
  students: z.object({
    studentId: code, name: text(120), email: z.email().transform((value) => value.toLowerCase()),
    password: z.string().min(10).max(128).optional(), department: z.string().trim().max(120).default(""),
    program: z.string().trim().max(120).default(""), year: z.string().trim().max(30).default(""),
    phone: z.string().trim().max(30).default(""), status: z.enum(["active", "pending", "inactive"]),
  }).strict(),
};
export type Resource = keyof typeof resourceSchemas;
