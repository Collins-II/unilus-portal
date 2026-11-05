import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingPolicy, bookingSchema, lusakaTime, overlaps, resourceSchemas } from "./policy.ts";

const now = Date.parse("2026-10-28T08:00:00Z");
function input(purpose: "Event" | "Tutorial Group", days: number) {
  const start = new Date(now + days * 86400000);
  return bookingSchema.parse({
    roomId: "123456789012345678901234", purpose, title: "Campus learning event", attendees: 15,
    startTime: start.toISOString(), endTime: new Date(start.getTime() + 3600000).toISOString(),
    ...(purpose === "Tutorial Group" ? { tutorialGroup: { groupName: "Study team", courseCode: "CSC101", topic: "Revision", leaderName: "Student Leader" } } : {}),
  });
}
test("tutorials require 48 hours and complete group information", () => {
  assert.match(bookingPolicy(input("Tutorial Group", 1), now) || "", /48 hours/);
  assert.equal(bookingPolicy(input("Tutorial Group", 2), now), null);
  const missing = input("Tutorial Group", 3);
  delete missing.tutorialGroup;
  assert.match(bookingPolicy(missing, now) || "", /details/);
});
test("events accept inclusive 7–14 day boundaries, reject outside them", () => {
  for (const days of [7, 10, 14]) assert.equal(bookingPolicy(input("Event", days), now), null);
  for (const days of [6, 15]) assert.match(bookingPolicy(input("Event", days), now) || "", /7–14/);
});
test("booking end must follow start and stay within campus opening hours", () => {
  const booking = input("Event", 8);
  booking.endTime = booking.startTime;
  assert.match(bookingPolicy(booking, now) || "", /after/);
  booking.startTime = new Date("2026-11-05T20:00:00Z");
  booking.endTime = new Date("2026-11-05T21:00:00Z");
  assert.match(bookingPolicy(booking, now) || "", /07:00/);
});
test("Lusaka conversion handles midnight and weekday rollover", () => {
  assert.deepEqual(lusakaTime(new Date("2026-10-31T23:00:00Z")), { date: "2026-11-01", day: 0, time: "01:00" });
});
test("interval conflicts exclude adjacent allocations", () => {
  assert.equal(overlaps("10:00", "11:00", "11:00", "12:00"), false);
  assert.equal(overlaps("10:00", "11:01", "11:00", "12:00"), true);
});
test("invalid booking data and unsupported status changes are rejected", () => {
  const valid = input("Event", 8);
  const json = { ...valid, startTime: valid.startTime.toISOString(), endTime: valid.endTime.toISOString() };
  assert.equal(bookingSchema.safeParse({ ...json, status: "confirmed" }).success, false);
  assert.equal(bookingSchema.safeParse({ ...json, attendees: 0 }).success, false);
  assert.equal(bookingSchema.safeParse({ ...json, roomId: "invalid" }).success, false);
});
test("campus schemas reject invalid times, unknown fields and invalid coordinates", () => {
  assert.equal(resourceSchemas.departments.safeParse({ code: "cs", name: "Computing" }).success, true);
  assert.equal(resourceSchemas.departments.safeParse({ code: "CS", name: "Computing", role: "admin" }).success, false);
  assert.equal(resourceSchemas.rooms.safeParse({ code: "L1", name: "Lecture 1", building: "Main", capacity: 30, spaceType: "lecture_room", latitude: -100, longitude: 28, isAvailable: true }).success, false);
  assert.equal(resourceSchemas.timetable.safeParse({ academicYear: "2026", semester: "1", department: "123456789012345678901234", course: "123456789012345678901234", room: "123456789012345678901234", cohort: "Year 1", lecturer: "Dr Test", dayOfWeek: 1, startTime: "25:00", endTime: "26:00", status: "published" }).success, false);
});
test("nonteaching locations discard capacity and equipment while retaining their floor", () => {
  const input = { code: "LIB", name: "Library", building: "Test", floor: 2, capacity: 200, equipment: ["Projector"], latitude: -15.3554635, longitude: 28.4691588, isAvailable: true };
  for (const spaceType of ["office", "library", "clinic", "cafeteria", "residence", "administrative", "other"]) {
    const result = resourceSchemas.rooms.parse({ ...input, spaceType });
    assert.equal(result.capacity, 0); assert.deepEqual(result.equipment, []); assert.equal(result.floor, 2);
  }
  for (const spaceType of ["lecture_room", "laboratory", "seminar_room"]) assert.equal(resourceSchemas.rooms.parse({ ...input, spaceType }).capacity, 200);
});
test("programme catalogue requires explicit supported campus and forbids forged student campus", () => {
  assert.equal(resourceSchemas.programmes.parse({ code: "test", name: "Test programme", department: "123456789012345678901234", campus: "leopards-hill" }).code, "TEST");
  assert.equal(resourceSchemas.programmes.safeParse({ code: "MED", name: "Medicine", department: "123456789012345678901234", campus: "unknown" }).success, false);
  assert.equal(resourceSchemas.students.safeParse({ studentId: "TEST", name: "Test", email: "test@example.invalid", status: "active", campus: "silverest" }).success, false);
});
