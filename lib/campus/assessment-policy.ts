import { z } from "zod";
import { lusakaTime } from "./policy.ts";

const id = z.string().regex(/^[a-f\d]{24}$/i);
const text = (max: number) => z.string().trim().min(1).max(max);
export const assessmentSchema = z.object({
  title: text(160), kind: z.enum(["quiz", "test", "exam"]), mode: z.enum(["in_person", "online"]),
  course: id, programme: text(30).transform((value) => value.toUpperCase()), year: text(30),
  cohort: text(100), lecturer: text(120), room: id.nullable(), classSize: z.number().int().min(1).max(10000),
  startTime: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  endTime: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  durationMinutes: z.number().int().min(1).max(240), status: z.enum(["draft", "published"]),
  instructions: z.string().trim().max(5000).default(""),
  questions: z.array(z.object({
    prompt: text(2000), options: z.array(text(500)).min(2).max(6),
    correctOption: z.number().int().min(0).max(5), points: z.number().int().min(1).max(100),
  }).strict().refine((question) => question.correctOption < question.options.length, "Choose a valid correct option.")).max(100),
}).strict().superRefine((value, context) => {
  if (value.endTime <= value.startTime) context.addIssue({ code: "custom", message: "End must follow start." });
  if (value.mode === "in_person") {
    if (!value.room) context.addIssue({ code: "custom", message: "An in-person assessment requires a verified teaching room." });
    const start = lusakaTime(value.startTime), end = lusakaTime(value.endTime);
    if (start.date !== end.date || start.time < "07:00" || end.time > "21:00") context.addIssue({ code: "custom", message: "In-person assessments must be on one campus day between 07:00 and 21:00." });
    if (value.questions.length) context.addIssue({ code: "custom", message: "Use online mode for automatically marked questions." });
  } else {
    if (value.room) context.addIssue({ code: "custom", message: "Online assessments do not reserve physical rooms." });
    if (!value.questions.length) context.addIssue({ code: "custom", message: "Add at least one question." });
    if (value.endTime.getTime() - value.startTime.getTime() < value.durationMinutes * 60000) context.addIssue({ code: "custom", message: "The assessment window must accommodate the attempt duration." });
  }
});
export type AssessmentInput = z.infer<typeof assessmentSchema>;
export function markAnswers(questions: AssessmentInput["questions"], answers: (number | null)[]) {
  return {
    score: questions.reduce((total, question, index) => total + (answers[index] === question.correctOption ? question.points : 0), 0),
    maximum: questions.reduce((total, question) => total + question.points, 0),
  };
}
export function attemptDeadline(start: Date, closes: Date, durationMinutes: number) {
  return new Date(Math.min(start.getTime() + durationMinutes * 60000, closes.getTime()));
}
