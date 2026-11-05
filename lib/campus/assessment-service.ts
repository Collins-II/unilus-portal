import "server-only";
import { z } from "zod";
import { Assessment, AssessmentAttempt } from "./assessment-models";
import { Course, Programme, Student } from "./models";
import { assessmentSchema, attemptDeadline, markAnswers, type AssessmentInput } from "./assessment-policy";
import { objectId, lusakaTime } from "./policy";
import { roomTransaction } from "./service";
import { scheduleSnapshot } from "./schedule-service";
import { allocationConflict, type Allocation } from "./scheduler";
import { HttpError } from "@/lib/server/http";
import { campusFor } from "./geography";

export async function saveAssessment(raw: unknown, id?: string) {
  const input = assessmentSchema.parse(raw);
  if (id) objectId.parse(id);
  return roomTransaction(input.room ? [input.room] : [], async (session) => {
    const old = id ? await Assessment.findById(id).session(session) : null;
    if (id && !old) throw new HttpError(404, "Assessment not found.");
    if (old && (old.startTime <= new Date() && old.status === "published" || await AssessmentAttempt.exists({ assessment: id }).session(session))) throw new HttpError(409, "Started assessments and their questions are immutable. Create a new assessment instead.");
    const programme = await Programme.findOne({ code: input.programme }).session(session);
    const course = await Course.findById(input.course).session(session);
    if (!programme || !course || String(course.department) !== String(programme.department)) throw new HttpError(422, "Choose a course in the study programme's department.");
    if (input.status === "published") {
      if (input.startTime <= new Date()) throw new HttpError(422, "Publish before the assessment starts.");
      const audienceConflict = await Assessment.exists({
        _id: { $ne: id }, status: "published", startTime: { $lt: input.endTime }, endTime: { $gt: input.startTime },
        $or: [{ programme: input.programme, year: input.year }, { lecturer: input.lecturer }],
      }).session(session);
      if (audienceConflict) throw new HttpError(409, "This audience or lecturer already has an assessment during that window.");
      if (input.room) {
        const snapshot = await scheduleSnapshot(session);
        const room = snapshot.rooms.find((room) => room.id === input.room);
        if (!room?.point || campusFor(room.point)?.id !== programme.campus) throw new HttpError(422, "Choose a room on the programme's assigned campus.");
        const start = lusakaTime(input.startTime), end = lusakaTime(input.endTime);
        const candidate: Allocation = { ...input, id: id ? `assessment:${id}` : undefined, room: input.room, department: String(programme.department), academicYear: "", semester: "", dayOfWeek: start.day, startTime: start.time, endTime: end.time };
        const error = allocationConflict(candidate, snapshot.allocations, snapshot.rooms, snapshot.bookings);
        if (error) throw new HttpError(409, error);
      }
    }
    const data = { ...input, campus: programme.campus, department: programme.department };
    const record = id ? await Assessment.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true, session }) : (await Assessment.create([data], { session }))[0];
    return { record };
  });
}

export const attemptAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), assessmentId: objectId }).strict(),
  z.object({ action: z.literal("answer"), assessmentId: objectId, question: z.number().int().min(0).max(99), option: z.number().int().min(0).max(5) }).strict(),
  z.object({ action: z.literal("submit"), assessmentId: objectId }).strict(),
]);
type StudentIdentity = { id: string };
export async function studentAssessments(identity: StudentIdentity, action?: z.infer<typeof attemptAction>) {
  return roomTransaction([], async (session) => {
    const student = await Student.findOne({ _id: identity.id, role: "student", status: "active" }).session(session);
    if (!student) throw new HttpError(403, "An active student account is required.");
    const assessments = await Assessment.find({ status: "published", programme: student.program, year: student.year }).sort({ startTime: 1 }).session(session).lean();
    const now = new Date();
    if (action) {
      const assessment = assessments.find((assessment) => String(assessment._id) === action.assessmentId);
      if (!assessment || assessment.mode !== "online") throw new HttpError(404, "Online assessment not available for your programme and year.");
      let attempt = await AssessmentAttempt.findOne({ assessment: assessment._id, student: student._id }).session(session);
      if (action.action === "start" && !attempt) {
        if (now < assessment.startTime || now >= assessment.endTime) throw new HttpError(409, "This assessment is not currently open.");
        [attempt] = await AssessmentAttempt.create([{
          assessment: assessment._id, student: student._id, startedAt: now,
          deadline: attemptDeadline(now, assessment.endTime, assessment.durationMinutes),
          answers: assessment.questions.map(() => -1), maximum: markAnswers(assessment.questions, []).maximum,
        }], { session });
      }
      if (!attempt) throw new HttpError(409, "Start your attempt first.");
      if (action.action === "answer") {
        if (attempt.submittedAt || now >= attempt.deadline) throw new HttpError(409, "The attempt has ended. Refresh to see its result.");
        const question = assessment.questions[action.question];
        if (!question || action.option >= question.options.length) throw new HttpError(422, "Invalid question or option.");
        attempt.answers[action.question] = action.option;
        attempt.markModified("answers");
        await attempt.save({ session });
      }
      if (!attempt.submittedAt && (action.action === "submit" || now >= attempt.deadline)) {
        Object.assign(attempt, markAnswers(assessment.questions, attempt.answers), { submittedAt: now });
        await attempt.save({ session });
      }
    }
    const attempts = await AssessmentAttempt.find({ student: student._id, assessment: { $in: assessments.map((assessment) => assessment._id) } }).session(session);
    for (const attempt of attempts) {
      if (!attempt.submittedAt && now >= attempt.deadline) {
        const assessment = assessments.find((assessment) => String(assessment._id) === String(attempt.assessment));
        if (!assessment) throw new HttpError(409, "Attempt assessment is no longer available.");
        Object.assign(attempt, markAnswers(assessment.questions, attempt.answers), { submittedAt: now });
        await attempt.save({ session });
      }
    }
    return { serverTime: now, assessments: assessments.map((assessment) => {
      const attempt = attempts.find((attempt) => String(attempt.assessment) === String(assessment._id));
      return {
        id: String(assessment._id), title: assessment.title, kind: assessment.kind, mode: assessment.mode,
        course: String(assessment.course), campus: assessment.campus, room: assessment.room ? String(assessment.room) : null,
        startTime: assessment.startTime, endTime: assessment.endTime, durationMinutes: assessment.durationMinutes, instructions: assessment.instructions,
        attempt: attempt ? { deadline: attempt.deadline, submittedAt: attempt.submittedAt, answers: attempt.answers,
          ...(attempt.submittedAt && now >= assessment.endTime ? { score: attempt.score, maximum: attempt.maximum } : {}) } : null,
        questions: attempt && !attempt.submittedAt && now < attempt.deadline ? (assessment.questions as AssessmentInput["questions"]).map(({ prompt, options, points }) => ({ prompt, options, points })) : [],
      };
    }) };
  });
}
