import { type Model } from "mongoose";
import { z } from "zod";
import { requireStaff, hashPassword } from "@/lib/server/auth";
import { handler, HttpError, readJson } from "@/lib/server/http";
import { Announcement, Booking, Course, Department, Room, Student, Timetable } from "@/lib/campus/models";
import { lusakaTime, objectId, overlaps, resourceSchemas, type Resource } from "@/lib/campus/policy";
import { roomTransaction } from "@/lib/campus/service";

const models = { rooms: Room, departments: Department, courses: Course, timetable: Timetable, announcements: Announcement, students: Student };
type Context = { params: Promise<{ resource: string }> };
async function resourceContext(context: Context) {
  const resource = (await context.params).resource as Resource;
  if (!Object.hasOwn(resourceSchemas, resource)) throw new HttpError(404, "Unknown campus resource.");
  await requireStaff(resource === "students" ? "admin" : undefined);
  // The resource key and its validator select the corresponding schema together.
  return { resource, model: models[resource] as unknown as Model<Record<string, unknown>> };
}
async function save(request: Request, context: Context, update: boolean) {
  const { resource, model } = await resourceContext(context);
  const raw = z.record(z.string(), z.unknown()).parse(await readJson(request));
  const { _id, ...body } = raw;
  const id = update ? objectId.parse(_id) : undefined;
  if (update && !await model.exists({ _id: id, ...(resource === "students" ? { role: "student" } : {}) })) throw new HttpError(404, "Record not found.");
  const parsed = resourceSchemas[resource].parse(body);
  const data = { ...parsed } as Record<string, unknown>;
  if (resource === "students") {
    if (!update && !data.password) throw new HttpError(422, "A password of at least 10 characters is required.");
    if (typeof data.password === "string") data.password = await hashPassword(data.password);
    else delete data.password;
    data.role = "student";
  }
  if (resource === "courses" || resource === "timetable") {
    if (!await Department.exists({ _id: data.department })) throw new HttpError(422, "Department not found.");
  }
  if (resource === "courses" && id && await Timetable.exists({ course: id, department: { $ne: data.department } })) {
    throw new HttpError(409, "Remove this course's timetable allocations before changing its department.");
  }
  if (resource === "rooms") {
    data.location = { type: "Point", coordinates: [data.longitude, data.latitude] };
    data.category = data.spaceType === "lecture_room" ? "lecture_hall" : data.spaceType;
    if (id) return roomTransaction([id], async (session) => {
      if (await Booking.exists({ room: id, status: { $in: ["pending", "confirmed"] }, endTime: { $gt: new Date() }, attendees: { $gt: data.capacity } }).session(session)) {
        throw new HttpError(409, "Capacity cannot be reduced below an upcoming booking's attendance.");
      }
      if (data.spaceType !== "lecture_room" && await Booking.exists({ room: id, status: { $in: ["pending", "confirmed"] }, endTime: { $gt: new Date() } }).session(session)) {
        throw new HttpError(409, "Cancel upcoming bookings before changing this lecture room's space type.");
      }
      if (data.isAvailable === false && (await Booking.exists({ room: id, status: { $in: ["pending", "confirmed"] }, endTime: { $gt: new Date() } }).session(session) ||
        await Timetable.exists({ room: id, status: "published" }).session(session))) {
        throw new HttpError(409, "Cancel bookings and unpublish this room's timetable before marking it unavailable.");
      }
      const record = await model.findByIdAndUpdate(id, { $set: data }, { session, new: true, runValidators: true });
      return { record };
    });
  }
  if (resource === "timetable") {
    const course = await Course.findById(data.course);
    if (!course || String(course.department) !== data.department) throw new HttpError(422, "Choose a course in the selected department.");
    const old = id ? await Timetable.findById(id) : null;
    return roomTransaction([String(data.room), ...(old ? [String(old.room)] : [])], async (session) => {
      const room = await Room.findById(data.room).session(session);
      if (!room || !room.isAvailable) throw new HttpError(422, "Choose an available teaching room.");
      if (data.status === "published") {
        const conflict = await Timetable.exists({
          _id: { $ne: id }, status: "published", dayOfWeek: data.dayOfWeek,
          startTime: { $lt: data.endTime }, endTime: { $gt: data.startTime },
          $or: [{ room: data.room }, { cohort: data.cohort, department: data.department }, { lecturer: data.lecturer }],
        }).session(session);
        if (conflict) throw new HttpError(409, "Published timetable conflicts with a room, cohort or lecturer allocation.");
        const bookings = await Booking.find({ room: data.room, status: { $in: ["pending", "confirmed"] }, endTime: { $gt: new Date() } }).session(session);
        const ids = bookings.filter((booking) => {
          const start = lusakaTime(booking.startTime), end = lusakaTime(booking.endTime);
          return start.day === data.dayOfWeek && overlaps(start.time, end.time, String(data.startTime), String(data.endTime));
        }).map((booking) => booking._id);
        if (ids.length) await Booking.updateMany({ _id: { $in: ids } }, { $set: { status: "cancelled", cancellationReason: "timetable_conflict" } }, { session });
      }
      const record = id
        ? await model.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true, session })
        : (await model.create([data], { session }))[0];
      return { record };
    });
  }
  const record = id ? await model.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }) : await model.create(data);
  return { record: resource === "students" ? { _id: record?._id } : record };
}
export const POST = handler((request: Request, context: Context) => save(request, context, false));
export const PATCH = handler((request: Request, context: Context) => save(request, context, true));
export const DELETE = handler(async (request: Request, context: Context) => {
  const { resource, model } = await resourceContext(context);
  const id = objectId.parse(new URL(request.url).searchParams.get("id"));
  if (resource === "students") throw new HttpError(422, "Deactivate student accounts instead of deleting their history.");
  if (resource === "rooms") {
    return roomTransaction([id], async (session) => {
      if (await Booking.exists({ room: id }).session(session) || await Timetable.exists({ room: id }).session(session)) throw new HttpError(409, "This room has booking or timetable history. Mark it unavailable instead.");
      await model.deleteOne({ _id: id }, { session });
      return { deleted: true };
    });
  }
  if (resource === "departments" && (await Course.exists({ department: id }) || await Timetable.exists({ department: id }))) throw new HttpError(409, "This department still has courses or timetable allocations.");
  if (resource === "courses" && await Timetable.exists({ course: id })) throw new HttpError(409, "This course still has timetable allocations.");
  if (resource === "timetable") {
    const row = await Timetable.findById(id);
    if (!row) throw new HttpError(404, "Record not found.");
    return roomTransaction([String(row.room)], async (session) => {
      await model.deleteOne({ _id: id }, { session });
      return { deleted: true };
    });
  }
  if (!(await model.deleteOne({ _id: id })).deletedCount) throw new HttpError(404, "Record not found.");
  return { deleted: true };
});
