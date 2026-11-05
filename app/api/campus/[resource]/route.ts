import { type Model } from "mongoose";
import { z } from "zod";
import { requireStaff, hashPassword } from "@/lib/server/auth";
import { handler, HttpError, readJson } from "@/lib/server/http";
import { Announcement, Booking, Course, Department, Programme, Room, Student, Timetable } from "@/lib/campus/models";
import { programmeAssignment } from "@/lib/campus/programme-service";
import { lusakaTime, objectId, overlaps, resourceSchemas, type Resource } from "@/lib/campus/policy";
import { roomTransaction } from "@/lib/campus/service";
import { scheduleSnapshot } from "@/lib/campus/schedule-service";
import { allocationConflict } from "@/lib/campus/scheduler";
import { Assessment } from "@/lib/campus/assessment-models";

const models = { rooms: Room, departments: Department, courses: Course, programmes: Programme, timetable: Timetable, announcements: Announcement, students: Student };
type Context = { params: Promise<{ resource: string }> };
async function resourceContext(context: Context) {
  const resource = (await context.params).resource as Resource;
  if (!Object.hasOwn(resourceSchemas, resource)) throw new HttpError(404, "Unknown campus resource.");
  await requireStaff(resource === "students" || resource === "programmes" ? "admin" : undefined);
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
    if (typeof data.password === "string") {
      data.password = await hashPassword(data.password);
      data.passwordSetupRequired = false;
      data.failedLogins = 0;
      data.lockedUntil = null;
    }
    else delete data.password;
    data.role = "student";
    return roomTransaction([], async (session) => {
      const student = id ? await Student.findById(id).session(session) : null;
      if (student?.passwordSetupRequired && data.status === "active" && !data.password) throw new HttpError(422, "Set a password before activating this imported student account.");
      if (typeof data.program === "string" && data.program) {
        if (!student || student.program !== data.program || await Programme.exists({ code: data.program.toUpperCase() }).session(session)) Object.assign(data, await programmeAssignment(data.program, session));
        else if (!Object.hasOwn(body, "department")) data.department = student.department ?? "";
      } else { data.campus = null; data.department = ""; }
      const record = id ? await Student.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true, session }) : (await Student.create([data], { session }))[0];
      if (!record) throw new HttpError(404, "Student not found.");
      return { record: { _id: record._id } };
    });
  }
  if (resource === "rooms") {
    data.location = { type: "Point", coordinates: [data.longitude, data.latitude] };
    data.category = data.spaceType === "lecture_room" ? "lecture_hall" : data.spaceType;
    if (id) return roomTransaction([id], async (session) => {
      if (await Assessment.exists({ room: id, status: "published", endTime: { $gt: new Date() } }).session(session)) throw new HttpError(409, "Unpublish upcoming assessments before changing their room.");
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
      const snapshot = await scheduleSnapshot(session);
      const published = await Timetable.find({ status: "published" }).session(session).lean();
      for (const row of snapshot.allocations.filter((allocation) => allocation.room === id && (allocation.id?.startsWith("assessment:") || published.some((item) => String(item._id) === allocation.id)))) {
        const conflict = allocationConflict(row, snapshot.allocations.filter((allocation) => allocation.id?.startsWith("assessment:") || published.some((item) => String(item._id) === allocation.id)), snapshot.rooms);
        if (conflict) throw new HttpError(409, `Room change would invalidate a published allocation: ${conflict}`);
      }
      return { record };
    });
  }
  if (resource === "timetable") {
    const old = id ? await Timetable.findById(id) : null;
    return roomTransaction([String(data.room), ...(old ? [String(old.room)] : [])], async (session) => {
      const course = await Course.findById(data.course).session(session);
      if (!course || String(course.department) !== data.department) throw new HttpError(422, "Choose a course in the selected department.");
      if (!await Department.exists({ _id: data.department }).session(session)) throw new HttpError(422, "Department not found.");
      const snapshot = await scheduleSnapshot(session);
      const input = resourceSchemas.timetable.parse(body);
      const suitability = allocationConflict({ ...input, id }, [], snapshot.rooms);
      if (suitability) throw new HttpError(422, suitability);
      if (data.status === "published") {
        const published = await Timetable.find({ status: "published" }).session(session).lean();
        const conflict = allocationConflict({ ...input, id }, snapshot.allocations.filter((allocation) => allocation.id?.startsWith("assessment:") || published.some((row) => String(row._id) === allocation.id)), snapshot.rooms);
        if (conflict) throw new HttpError(409, conflict);
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
  if (resource === "courses" || resource === "departments" || resource === "programmes") {
    return roomTransaction([], async (session) => {
      if (resource === "departments" && id) {
        const previous = await Department.findById(id).session(session);
        if (!previous) throw new HttpError(404, "Department not found.");
        const programmes = await Programme.find({ department: id }).session(session).select("code").lean();
        await Student.updateMany({ role: "student", program: { $in: programmes.map((programme) => programme.code) } }, { $set: { department: data.code } }, { session });
      }
      if (resource === "courses" || resource === "programmes") {
        if (!await Department.exists({ _id: data.department }).session(session)) throw new HttpError(422, "Department not found.");
        if (resource === "courses" && id) {
          const previous = await Course.findById(id).session(session);
          if (previous && String(previous.department) !== data.department && await Assessment.exists({ course: id }).session(session)) throw new HttpError(409, "This course has assessment history; its department cannot be changed.");
        }
        if (resource === "courses" && id && await Timetable.exists({ course: id, department: { $ne: data.department } }).session(session)) {
          throw new HttpError(409, "Remove this course's timetable allocations before changing its department.");
        }
        if (resource === "programmes" && id) {
          const previous = await Programme.findById(id).session(session);
          const department = await Department.findById(data.department).session(session);
          if (!previous || !department) throw new HttpError(404, "Programme or department not found.");
          if ((previous.code !== data.code || previous.campus !== data.campus || String(previous.department) !== data.department) && await Assessment.exists({ programme: previous.code }).session(session)) throw new HttpError(409, "This programme has assessment history; create a new programme rather than changing its assignment.");
          await Student.updateMany({ program: previous.code, role: "student" }, { $set: { program: data.code, campus: data.campus, department: department.code } }, { session });
        }
      }
      const record = id ? await model.findByIdAndUpdate(id, { $set: data }, { session, new: true, runValidators: true }) : (await model.create([data], { session }))[0];
      if (!record) throw new HttpError(404, "Record not found.");
      return { record };
    });
  }
  const record = id ? await model.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }) : await model.create(data);
  return { record };
}
export const POST = handler((request: Request, context: Context) => save(request, context, false));
export const PATCH = handler((request: Request, context: Context) => save(request, context, true));
export const DELETE = handler(async (request: Request, context: Context) => {
  const { resource, model } = await resourceContext(context);
  const id = objectId.parse(new URL(request.url).searchParams.get("id"));
  if (resource === "students") throw new HttpError(422, "Deactivate student accounts instead of deleting their history.");
  if (resource === "rooms") {
    return roomTransaction([id], async (session) => {
      if (await Assessment.exists({ room: id }).session(session) || await Booking.exists({ room: id }).session(session) || await Timetable.exists({ room: id }).session(session)) throw new HttpError(409, "This room has booking, assessment or timetable history. Mark it unavailable instead.");
      await model.deleteOne({ _id: id }, { session });
      return { deleted: true };
    });
  }
  if (resource === "departments" || resource === "courses" || resource === "programmes") {
    return roomTransaction([], async (session) => {
      if (resource !== "programmes" && await Assessment.exists({ [resource === "courses" ? "course" : "department"]: id }).session(session)) throw new HttpError(409, "This record has assessment history.");
      if (resource === "departments" && (await Programme.exists({ department: id }).session(session) || await Course.exists({ department: id }).session(session) || await Timetable.exists({ department: id }).session(session))) throw new HttpError(409, "This department still has programmes, courses or timetable allocations.");
      if (resource === "programmes") {
        const programme = await Programme.findById(id).session(session);
        if (programme && (await Assessment.exists({ programme: programme.code }).session(session) || await Student.exists({ program: programme.code, role: "student" }).session(session))) throw new HttpError(409, "This programme has students or assessment history.");
      }
      if (resource === "courses" && await Timetable.exists({ course: id }).session(session)) throw new HttpError(409, "This course still has timetable allocations.");
      if (!(await model.deleteOne({ _id: id }, { session })).deletedCount) throw new HttpError(404, "Record not found.");
      return { deleted: true };
    });
  }
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
