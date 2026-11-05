import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { campusIds } from "./geography";

function register<S extends Schema>(name: string, schema: S, collection: string) {
  return (mongoose.models[name] as mongoose.Model<InferSchemaType<S>>) ||
    mongoose.model<InferSchemaType<S>>(name, schema, collection);
}
const ref = (name: string) => ({ type: Schema.Types.ObjectId, ref: name, required: true });

export const Room = register("CampusRoom", new Schema({
  name: { type: String, required: true }, code: { type: String, required: true, unique: true },
  building: { type: String, required: true }, floor: { type: Number, default: 0 },
  capacity: { type: Number, default: 0 }, category: { type: String, default: "lecture_hall" },
  spaceType: { type: String, required: true }, latitude: Number, longitude: Number,
  location: { type: { type: String, default: "Point" }, coordinates: [Number] },
  equipment: [String], description: String, isAvailable: { type: Boolean, default: true },
  scheduleVersion: { type: Number, default: 0 },
}, { timestamps: true }), "rooms");
export const Department = register("CampusDepartment", new Schema({
  code: { type: String, required: true, unique: true }, name: { type: String, required: true },
}, { timestamps: true }), "departments");
export const Course = register("CampusCourse", new Schema({
  code: { type: String, required: true, unique: true }, title: { type: String, required: true },
  department: ref("CampusDepartment"),
}, { timestamps: true }), "courses");
export const Programme = register("CampusProgramme", new Schema({
  code: { type: String, required: true, unique: true }, name: { type: String, required: true },
  department: ref("CampusDepartment"), campus: { type: String, enum: campusIds, required: true },
}, { timestamps: true }), "programmes");
export const Timetable = register("CampusTimetable", new Schema({
  academicYear: { type: String, required: true }, semester: { type: String, required: true },
  department: ref("CampusDepartment"), course: ref("CampusCourse"), room: ref("CampusRoom"),
  cohort: String, lecturer: String, dayOfWeek: { type: Number, required: true },
  startTime: { type: String, required: true }, endTime: { type: String, required: true },
  notes: String, status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
  classSize: { type: Number, default: 0 }, requiredEquipment: [String], roomType: String,
}, { timestamps: true }), "timetableallocations");
export const Announcement = register("CampusAnnouncement", new Schema({
  title: { type: String, required: true }, message: { type: String, required: true },
  priority: { type: String, enum: ["normal", "important", "urgent"], default: "normal" },
  status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
}, { timestamps: true }), "announcements");
export const Student = register("CampusStudent", new Schema({
  studentId: { type: String, required: true, unique: true }, name: { type: String, required: true },
  email: { type: String, required: true, unique: true }, password: { type: String, required: true, select: false },
  role: { type: String, default: "student" }, department: String, program: String, year: String, phone: String,
  campus: { type: String, enum: campusIds },
  passwordSetupRequired: { type: Boolean, default: false },
  failedLogins: { type: Number, default: 0, select: false }, lockedUntil: { type: Date, select: false },
  status: { type: String, enum: ["active", "pending", "inactive"], default: "active" },
}, { timestamps: true }), "users");
export const Booking = register("CampusBooking", new Schema({
  user: ref("CampusStudent"), room: ref("CampusRoom"), purpose: { type: String, required: true },
  title: String, attendees: { type: Number, default: 1 },
  tutorialGroup: { type: new Schema({ groupName: String, courseCode: String, topic: String, leaderName: String }, { _id: false }) },
  requestedAt: Date, cancellationReason: String,
  conversation: { type: Schema.Types.ObjectId, default: null },
  startTime: { type: Date, required: true }, endTime: { type: Date, required: true },
  status: { type: String, enum: ["pending", "confirmed", "cancelled"], default: "pending" },
}, { timestamps: true }), "bookings");

const importBatchSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, required: true },
  resource: { type: String, enum: ["students", "courses"], required: true },
  rows: { type: [Schema.Types.Mixed], required: true },
  updateExisting: { type: Boolean, required: true },
  fingerprint: { type: String, required: true },
  status: { type: String, enum: ["preview", "completed"], default: "preview" },
  result: { created: Number, updated: Number, skipped: Number },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
importBatchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const ImportBatch = register("CampusImportBatch", importBatchSchema, "campusimportbatches");

const scheduleBatchSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, required: true },
  fingerprint: { type: String, required: true },
  result: { type: Schema.Types.Mixed, required: true },
  status: { type: String, enum: ["preview", "completed"], default: "preview" },
  allocationIds: [Schema.Types.ObjectId],
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
scheduleBatchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const ScheduleBatch = register("CampusScheduleBatch", scheduleBatchSchema, "campusschedulebatches");
