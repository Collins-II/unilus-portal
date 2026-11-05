import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { campusIds } from "./geography";

const assessmentSchema = new Schema({
  title: { type: String, required: true }, kind: { type: String, enum: ["quiz", "test", "exam"], required: true },
  mode: { type: String, enum: ["in_person", "online"], required: true },
  course: { type: Schema.Types.ObjectId, ref: "CampusCourse", required: true },
  programme: { type: String, required: true }, department: { type: Schema.Types.ObjectId, ref: "CampusDepartment", required: true },
  year: { type: String, required: true }, cohort: { type: String, required: true }, lecturer: { type: String, required: true },
  campus: { type: String, enum: campusIds, required: true },
  room: { type: Schema.Types.ObjectId, ref: "CampusRoom", default: null }, classSize: { type: Number, required: true },
  startTime: { type: Date, required: true }, endTime: { type: Date, required: true },
  durationMinutes: { type: Number, required: true }, status: { type: String, enum: ["draft", "published"], default: "draft" },
  instructions: { type: String, default: "" },
  questions: [{ _id: false, prompt: { type: String, required: true }, options: [String], correctOption: { type: Number, required: true }, points: { type: Number, required: true } }],
}, { timestamps: true, collection: "assessments" });
const attemptSchema = new Schema({
  assessment: { type: Schema.Types.ObjectId, ref: "CampusAssessment", required: true },
  student: { type: Schema.Types.ObjectId, ref: "CampusStudent", required: true },
  startedAt: { type: Date, required: true }, deadline: { type: Date, required: true },
  submittedAt: { type: Date, default: null }, answers: { type: [Number], default: [] },
  score: { type: Number, default: null }, maximum: { type: Number, required: true },
}, { timestamps: true, collection: "assessmentattempts" });
attemptSchema.index({ assessment: 1, student: 1 }, { unique: true });
export const Assessment = (mongoose.models.CampusAssessment as mongoose.Model<InferSchemaType<typeof assessmentSchema>>) || mongoose.model("CampusAssessment", assessmentSchema);
export const AssessmentAttempt = (mongoose.models.CampusAssessmentAttempt as mongoose.Model<InferSchemaType<typeof attemptSchema>>) || mongoose.model("CampusAssessmentAttempt", attemptSchema);
