import assert from "node:assert/strict";
import { test } from "node:test";
import { campusFor, campuses, distanceMetres, insideCampus } from "./geography.ts";
import { allocationConflict, generateSchedule, scheduleInput, travelMinutes, minutes, clock, type Allocation, type TeachingRoom } from "./scheduler.ts";
import { resourceSchemas } from "./policy.ts";

const department = "100000000000000000000001", course = "200000000000000000000001";
const room: TeachingRoom = { id: "300000000000000000000001", name: "Test lecture room", code: "T1", spaceType: "lecture_room", capacity: 60, isAvailable: true, equipment: ["Projector"], point: { latitude: -15.3554635, longitude: 28.4691588 } };
const farRoom: TeachingRoom = { ...room, id: "300000000000000000000002", code: "T2", point: { latitude: -15.3553635, longitude: 28.4691588 } };
const leopardsHill: TeachingRoom = { ...room, id: "300000000000000000000003", code: "L1", point: { latitude: -15.4535623, longitude: 28.3795288 } };
const allocation: Allocation = { academicYear: "2026", semester: "1", department, course, room: room.id, cohort: "Year 1", lecturer: "Lecturer A", dayOfWeek: 1, startTime: "08:00", endTime: "09:00", classSize: 30, requiredEquipment: ["projector"] };
function input(overrides = {}) {
  return scheduleInput.parse({ academicYear: "2026", semester: "1", demands: [{ course, department, cohort: "Year 1", lecturer: "Lecturer A", campus: "silverest", classSize: 30, weeklySessions: 3, durationMinutes: 60, roomType: "lecture_room", equipment: ["projector"], ...overrides }] });
}
test("UNILUS outlines distinguish campuses and exclude Lusaka/corner coordinates", () => {
  assert.equal(campusFor(room.point!)?.id, "silverest");
  assert.equal(campusFor(leopardsHill.point!)?.id, "leopards-hill");
  assert.equal(campusFor({ latitude: -15.4167, longitude: 28.2833 }), undefined);
  assert.equal(campusFor({ latitude: -15.402, longitude: 28.3227 }), undefined);
  assert.equal(campusFor({ latitude: NaN, longitude: 28.3 }), undefined);
  for (const campus of campuses) {
    if (campus.polygon.length) assert.equal(insideCampus({ latitude: campus.polygon[0][1], longitude: campus.polygon[0][0] }, campus), true);
    else {
      assert.equal(campus.scopeKind, "approximate");
      assert.equal(insideCampus({ latitude: campus.centre[0], longitude: campus.centre[1] }, campus), true);
    }
  }
});
test("Massmedia is an explicit approximate scope, and UNZA campus points are rejected", () => {
  const massmedia = campuses.find((campus) => campus.id === "massmedia")!;
  assert.equal(massmedia.scopeKind, "approximate");
  assert.deepEqual(massmedia.polygon, []);
  assert.equal(campusFor({ latitude: massmedia.centre[0], longitude: massmedia.centre[1] })?.id, "massmedia");
  assert.equal(campusFor({ latitude: -15.3948733, longitude: 28.3315259 }), undefined);
  assert.equal(campusFor({ latitude: -15.4280748, longitude: 28.3096636 }), undefined);
});
test("room API schema rejects off-campus manual coordinates and accepts both campuses", () => {
  const fields = { code: "T", name: "Test", building: "Test", capacity: 30, spaceType: "lecture_room", isAvailable: true };
  assert.equal(resourceSchemas.rooms.safeParse({ ...fields, ...room.point }).success, true);
  assert.equal(resourceSchemas.rooms.safeParse({ ...fields, ...leopardsHill.point }).success, true);
  assert.equal(resourceSchemas.rooms.safeParse({ ...fields, latitude: 0, longitude: 0 }).success, false);
});
test("travel estimate enforces exact walking and five-minute thresholds", () => {
  assert.equal(distanceMetres(room.point!, room.point!), 0);
  assert.equal(travelMinutes(room, room), 5);
  const required = travelMinutes(room, farRoom)!;
  assert.ok(required > 5);
  const existing = [{ ...allocation, room: farRoom.id }];
  assert.match(allocationConflict({ ...allocation, startTime: clock(540 + required - 1), endTime: clock(600 + required) }, existing, [room, farRoom]) || "", /transfer/);
  assert.equal(allocationConflict({ ...allocation, startTime: clock(540 + required), endTime: clock(600 + required) }, existing, [room, farRoom]), null);
  assert.match(allocationConflict({ ...allocation, startTime: "09:04", endTime: "10:00" }, [allocation], [room]) || "", /transfer/);
  assert.equal(allocationConflict({ ...allocation, startTime: "09:05", endTime: "10:00" }, [allocation], [room]), null);
});
test("cross-campus travel is not treated as an ordinary changeover", () => {
  assert.ok(travelMinutes(room, leopardsHill)! > 60);
  assert.match(allocationConflict({ ...allocation, room: leopardsHill.id, startTime: "09:30", endTime: "10:30" }, [allocation], [room, leopardsHill]) || "", /transfer/);
});
test("unknown room coordinates never receive a success-shaped travel estimate", () => {
  assert.equal(travelMinutes(room, { ...farRoom, point: null }), null);
  assert.match(allocationConflict({ ...allocation, room: farRoom.id, startTime: "14:00", endTime: "15:00" }, [allocation], [room, { ...farRoom, point: null }]) || "", /verify/);
});
test("room, lecturer and cohort conflicts are normalized and terms conservatively overlap", () => {
  const candidate = { ...allocation, room: farRoom.id, cohort: "Other", lecturer: "  LECTURER   a ", academicYear: "2027" };
  assert.match(allocationConflict(candidate, [allocation], [room, farRoom]) || "", /overlaps/);
  assert.match(allocationConflict({ ...candidate, lecturer: "Other", cohort: " year  1 " }, [allocation], [room, farRoom]) || "", /overlaps/);
  assert.equal(allocationConflict({ ...candidate, lecturer: "Other", dayOfWeek: 2 }, [allocation], [room, farRoom]), null);
});
test("capacity, equipment, teaching space type, availability and bookings are hard constraints", () => {
  assert.match(allocationConflict({ ...allocation, classSize: 61 }, [], [room]) || "", /capacity/);
  assert.match(allocationConflict({ ...allocation, requiredEquipment: ["Microscope"] }, [], [room]) || "", /equipment/);
  assert.match(allocationConflict({ ...allocation, roomType: "laboratory" }, [], [room]) || "", /type/);
  assert.match(allocationConflict(allocation, [], [{ ...room, isAvailable: false }]) || "", /available/);
  assert.match(allocationConflict(allocation, [], [{ ...room, spaceType: "office" }]) || "", /available/);
  assert.match(allocationConflict(allocation, [], [room], [{ room: room.id, dayOfWeek: 1, startTime: "08:30", endTime: "09:30" }]) || "", /booking/);
  assert.equal(allocationConflict(allocation, [], [room], [{ room: room.id, dayOfWeek: 1, startTime: "09:00", endTime: "10:00" }]), null);
});
test("preview generates the exact requested number on separate weekdays outside lunch", () => {
  const result = generateSchedule(input(), [room], [], []);
  assert.equal(result.allocations.length, 3);
  assert.equal(result.unscheduled.length, 0);
  assert.equal(new Set(result.allocations.map((row) => row.dayOfWeek)).size, 3);
  for (const row of result.allocations) {
    assert.ok(row.dayOfWeek >= 1 && row.dayOfWeek <= 5);
    assert.equal(minutes(row.endTime) - minutes(row.startTime), 60);
    assert.ok(minutes(row.startTime) >= 480 && minutes(row.endTime) <= 1020);
    assert.ok(!(minutes(row.startTime) < 780 && minutes(row.endTime) > 720));
  }
  assert.equal(result.metrics.roomUtilisationPercent, 50);
});
test("existing drafts/bookings are preserved and all generated rows pass the same validator", () => {
  const existing = [{ ...allocation, id: "400000000000000000000001" }];
  const bookings = [{ room: room.id, dayOfWeek: 2, startTime: "08:00", endTime: "12:00" }];
  const snapshot = JSON.stringify(existing);
  const result = generateSchedule(input(), [room, farRoom], existing, bookings);
  assert.equal(result.allocations.length, 3);
  assert.equal(JSON.stringify(existing), snapshot);
  for (const row of result.allocations) assert.equal(allocationConflict(row, [...existing, ...result.allocations.filter((other) => other !== row)], [room, farRoom], bookings), null);
});
test("room selection respects campus and excludes unverified or insufficient rooms", () => {
  const result = generateSchedule(input({ campus: "leopards-hill" }), [room, leopardsHill, { ...farRoom, point: null }], [], []);
  assert.equal(result.allocations.length, 3);
  assert.ok(result.allocations.every((row) => row.room === leopardsHill.id));
  const missing = generateSchedule(input({ classSize: 200 }), [room], [], []);
  assert.equal(missing.allocations.length, 0);
  assert.equal(missing.unscheduled.length, 3);
  assert.match(missing.unscheduled[0].reason, /No verified/);
});
test("multiple course and lecturer requirements remain conflict-free across both campuses", () => {
  const request = input({ weeklySessions: 2 });
  request.demands.push({ ...request.demands[0], course: "200000000000000000000002", campus: "leopards-hill" });
  const result = generateSchedule(request, [room, farRoom, leopardsHill], [], []);
  assert.equal(result.allocations.length, 4);
  for (const row of result.allocations) assert.equal(allocationConflict(row, result.allocations.filter((other) => other !== row), [room, farRoom, leopardsHill]), null);
});
test("scheduler is deterministic and validates exact batch/duration limits", () => {
  assert.deepEqual(generateSchedule(input(), [room, farRoom], [], []), generateSchedule(input(), [room, farRoom], [], []));
  assert.equal(scheduleInput.safeParse({ ...input(), demands: [{ ...input().demands[0], durationMinutes: 45 }] }).success, false);
  assert.equal(scheduleInput.safeParse({ ...input(), demands: [input().demands[0], input().demands[0]] }).success, false);
  const demands = Array.from({ length: 17 }, (_, i) => ({ ...input().demands[0], course: (i + 1).toString(16).padStart(24, "0"), weeklySessions: 5 }));
  assert.equal(scheduleInput.safeParse({ ...input(), demands: demands.slice(0, 16) }).success, true);
  assert.equal(scheduleInput.safeParse({ ...input(), demands }).success, false);
});
test("maximum-size requests account for every session and respect the search budget", () => {
  const request = input({ weeklySessions: 5 });
  request.demands = Array.from({ length: 16 }, (_, i) => ({ ...request.demands[0], course: (i + 1).toString(16).padStart(24, "0") }));
  const result = generateSchedule(request, [room, farRoom, { ...farRoom, id: "300000000000000000000004", code: "T4" }], [], []);
  assert.equal(result.metrics.requested, 80);
  assert.equal(result.allocations.length + result.unscheduled.length, 80);
  assert.ok(result.metrics.candidateEvaluations <= 500000);
  for (const row of result.allocations) assert.equal(allocationConflict(row, result.allocations.filter((other) => other !== row), [room, farRoom, { ...farRoom, id: "300000000000000000000004", code: "T4" }]), null);
});
