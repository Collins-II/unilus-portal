import assert from "node:assert/strict";
import { test } from "node:test";
import { assessmentSchema, markAnswers, attemptDeadline } from "./assessment-policy.ts";
const input = {
  title: "Test", kind: "quiz", mode: "online", course: "123456789012345678901234", programme: "CS", year: "1",
  cohort: "Year 1", lecturer: "Dr Test", room: null, classSize: 20, durationMinutes: 30, status: "draft",
  startTime: "2030-01-01T08:00:00Z", endTime: "2030-01-01T10:00:00Z",
  questions: [{ prompt: "Pick A", options: ["A", "B"], correctOption: 0, points: 3 }, { prompt: "Pick B", options: ["A", "B"], correctOption: 1, points: 2 }],
};
test("assessment schema validates exact correct-option bounds and delivery requirements", () => {
  assert.equal(assessmentSchema.safeParse(input).success, true);
  assert.equal(assessmentSchema.safeParse({ ...input, questions: [{ ...input.questions[0], correctOption: 2 }] }).success, false);
  assert.equal(assessmentSchema.safeParse({ ...input, questions: [] }).success, false);
  assert.equal(assessmentSchema.safeParse({ ...input, mode: "in_person" }).success, false);
  assert.equal(assessmentSchema.safeParse({ ...input, mode: "in_person", room: input.course, questions: [] }).success, true);
  assert.equal(assessmentSchema.safeParse({ ...input, room: input.course }).success, false);
  assert.equal(assessmentSchema.safeParse({ ...input, durationMinutes: 121 }).success, false);
});
test("authoritative marking handles wrong, unanswered and extra answers without extra credit", () => {
  const questions = assessmentSchema.parse(input).questions;
  assert.deepEqual(markAnswers(questions, [0, 1]), { score: 5, maximum: 5 });
  assert.deepEqual(markAnswers(questions, [-1, 0, 1]), { score: 0, maximum: 5 });
  assert.deepEqual(markAnswers(questions, [null, 1]), { score: 2, maximum: 5 });
});
test("deadline is limited by both duration and absolute close time", () => {
  const start = new Date("2030-01-01T08:00:00Z");
  assert.equal(attemptDeadline(start, new Date("2030-01-01T10:00:00Z"), 30).toISOString(), "2030-01-01T08:30:00.000Z");
  assert.equal(attemptDeadline(start, new Date("2030-01-01T08:10:00Z"), 30).toISOString(), "2030-01-01T08:10:00.000Z");
});
