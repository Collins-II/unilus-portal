import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { setServers } from "node:dns/promises";

// Explicit opt-in: creates uniquely named fixtures in the configured shared database, then removes only those IDs.
if (process.env.RUN_CAMPUS_SMOKE !== "1") throw new Error("Set RUN_CAMPUS_SMOKE=1 to run campus API smoke tests.");
const base = process.env.CAMPUS_TEST_URL || "http://localhost:3001";
const suffix = randomBytes(5).toString("hex").toUpperCase();
const cookieJar = new Map();
const fixtures = new Map();
const importedStudents = [];
const importedCourses = [];
if (process.env.DNS_SERVERS) setServers(process.env.DNS_SERVERS.split(",").map((server) => server.trim()).filter(Boolean));
function remember(collection, id) {
  if (!fixtures.has(collection)) fixtures.set(collection, []);
  fixtures.get(collection).push(new mongoose.Types.ObjectId(id));
}
async function request(path, { method = "GET", body, integration = false, expect = 200 } = {}) {
  const response = await fetch(`${base}${path}`, {
    method, redirect: "manual", signal: AbortSignal.timeout(90000),
    headers: {
      Cookie: [...cookieJar].map(([key, value]) => `${key}=${value}`).join("; "),
      ...(integration ? { "x-student-app-key": process.env.STUDENT_APP_API_KEY } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    const index = pair.indexOf("=");
    cookieJar.set(pair.slice(0, index), pair.slice(index + 1));
  }
  const result = await response.json();
  assert.equal(response.status, expect, `${method} ${path}: ${result.error || "unexpected status"}`);
  return result;
}
async function create(resource, body, collection = resource) {
  const { record } = await request(`/api/campus/${resource}`, { method: "POST", body });
  remember(collection, record._id);
  return record;
}
// Stage only synthetic, uniquely named previews; production previews are created by the validated HTTPS fetch route.
async function stageImport(owner, resource, rows, actions, snapshot, updateExisting = false) {
  const id = new mongoose.Types.ObjectId();
  remember("campusimportbatches", String(id));
  await mongoose.connection.collection("campusimportbatches").insertOne({
    _id: id, owner: new mongoose.Types.ObjectId(owner), resource, rows, updateExisting, status: "preview",
    fingerprint: createHash("sha256").update(JSON.stringify({ snapshot, actions })).digest("hex"),
    expiresAt: new Date(Date.now() + 15 * 60000),
  });
  return String(id);
}
try {
  assert.ok(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD, "Bootstrap admin credentials are required for this smoke test.");
  assert.equal((await fetch(`${base}/setup`, { redirect: "manual", signal: AbortSignal.timeout(30000) })).status, 200);
  await request("/api/admin/bootstrap", { expect: 401 });
  await request("/api/campus/auto-allocate", { method: "POST", body: {}, expect: 401 });
  const csrf = await request("/api/auth/csrf");
  const response = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(90000),
    headers: { Cookie: [...cookieJar].map(([key, value]) => `${key}=${value}`).join("; "), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, callbackUrl: base, json: "true" }),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0], index = pair.indexOf("=");
    cookieJar.set(pair.slice(0, index), pair.slice(index + 1));
  }
  const workspace = await request("/api/campus");
  assert.equal(workspace.staff.role, "admin");
  assert.equal((await request("/api/admin/bootstrap")).configured, true);
  await request("/api/integration/campus", { expect: 401 });
  console.log("PASS staff authentication and campus workspace");

  const department = await create("departments", { code: `T${suffix}`, name: `Smoke department ${suffix}` });
  const course = await create("courses", { code: `T${suffix}`, title: "Smoke course", department: department._id });
  const programmeBody = { code: `P${suffix}`, name: "Smoke programme", department: department._id, campus: "silverest" };
  const programme = await create("programmes", programmeBody);
  const room = await create("rooms", { code: `T${suffix}`, name: `Smoke lecture room ${suffix}`, building: "Test", floor: 0, capacity: 30, spaceType: "lecture_room", latitude: -15.3554635, longitude: 28.4691588, description: "", equipment: [], isAvailable: true });
  const studentBody = { studentId: `T${suffix}`, name: "Smoke Student", email: `campus-smoke-${suffix.toLowerCase()}@example.invalid`, password: randomBytes(18).toString("hex"), department: "FORGED", program: programme.code, year: "1", phone: "", status: "active" };
  await create("students", studentBody, "users");
  const announcementBody = { title: `Smoke ${suffix}`, message: "Campus smoke test", priority: "normal", status: "draft" };
  const announcement = await create("announcements", announcementBody);
  const campusDraft = await request("/api/integration/campus", { integration: true });
  assert.ok(!campusDraft.announcements.some((item) => item._id === announcement._id));
  await request("/api/campus/announcements", { method: "PATCH", body: { ...announcementBody, _id: announcement._id, status: "published" } });
  assert.ok((await request("/api/integration/campus", { integration: true })).announcements.some((item) => item._id === announcement._id));
  console.log("PASS campus resource creation and draft/published visibility");

  await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 15000 });
  const importStudent = { studentId: `I${suffix}`, name: "Imported Smoke Student", email: `import-smoke-${suffix.toLowerCase()}@example.invalid` };
  importedStudents.push(importStudent.studentId);
  const studentPreview = await stageImport(workspace.staff.id, "students", [importStudent], [{ identity: importStudent.studentId, label: importStudent.name, action: "create" }], { records: [], programmes: [], departments: [] });
  const imported = await request("/api/campus/imports", { method: "PATCH", body: { previewId: studentPreview } });
  assert.deepEqual(imported.counts, { created: 1, updated: 0, skipped: 0 });
  assert.deepEqual((await request("/api/campus/imports", { method: "PATCH", body: { previewId: studentPreview } })).counts, imported.counts);
  const pendingStudent = (await request("/api/campus")).students.find((student) => student.studentId === importStudent.studentId);
  assert.equal(pendingStudent.status, "pending");
  assert.equal(pendingStudent.passwordSetupRequired, true);
  await request("/api/campus/students", { method: "PATCH", body: { ...importStudent, _id: pendingStudent._id, status: "active" }, expect: 422 });
  const importedPassword = randomBytes(18).toString("hex");
  await request("/api/campus/students", { method: "PATCH", body: { ...importStudent, _id: pendingStudent._id, password: importedPassword, status: "active", program: programme.code } });
  const beforeImport = await mongoose.connection.collection("users").findOne({ _id: new mongoose.Types.ObjectId(pendingStudent._id) });
  const existingSnapshot = await mongoose.connection.collection("users").find({ studentId: importStudent.studentId }, { projection: { studentId: 1, email: 1, name: 1, role: 1, status: 1, updatedAt: 1 } }).sort({ _id: 1 }).toArray();
  const updateRows = [{ ...importStudent, name: "Updated Smoke Student" }];
  const updateActions = [{ identity: importStudent.studentId, label: updateRows[0].name, action: "update", id: pendingStudent._id }];
  const updatePreview = await stageImport(workspace.staff.id, "students", updateRows, updateActions, { records: existingSnapshot, programmes: [], departments: [] }, true);
  assert.equal((await request("/api/campus/imports", { method: "PATCH", body: { previewId: updatePreview } })).counts.updated, 1);
  const afterImport = await mongoose.connection.collection("users").findOne({ _id: beforeImport._id });
  assert.equal(afterImport.password, beforeImport.password);
  assert.equal(afterImport.status, "active");
  assert.equal(afterImport.program, programme.code);
  assert.equal(afterImport.campus, "silverest");
  assert.equal(afterImport.passwordSetupRequired, false);
  const stalePreview = await stageImport(workspace.staff.id, "students", updateRows, updateActions, { records: existingSnapshot, programmes: [], departments: [] }, true);
  await request("/api/campus/imports", { method: "PATCH", body: { previewId: stalePreview }, expect: 409 });
  const collision = { ...importStudent, studentId: `C${suffix}`, email: studentBody.email };
  const collisionPreview = await stageImport(workspace.staff.id, "students", [collision], [{ identity: collision.studentId, label: collision.name, action: "create" }], []);
  await request("/api/campus/imports", { method: "PATCH", body: { previewId: collisionPreview }, expect: 409 });
  assert.equal(await mongoose.connection.collection("users").countDocuments({ studentId: collision.studentId }), 0);
  const importCourse = { code: `I${suffix}`, title: "Imported Smoke Course", department: department.code };
  importedCourses.push(importCourse.code);
  const departmentSnapshot = await mongoose.connection.collection("departments").find({ code: department.code }).sort({ _id: 1 }).toArray();
  const coursePreview = await stageImport(workspace.staff.id, "courses", [importCourse], [{ identity: importCourse.code, label: importCourse.title, action: "create", departmentId: department._id }], { records: [], departments: departmentSnapshot });
  assert.equal((await request("/api/campus/imports", { method: "PATCH", body: { previewId: coursePreview } })).counts.created, 1);
  const savedCourse = (await request("/api/campus")).courses.find((item) => item.code === importCourse.code);
  assert.equal(savedCourse.department._id, department._id);
  await request("/api/campus/imports", { method: "POST", body: { resource: "students", url: "https://127.0.0.1/api", mapping: { studentId: "id", name: "name", email: "email" } }, expect: 422 });
  console.log("PASS import commits, idempotency, pending activation, preserved credentials, stale previews and collision rollback");

  await request("/api/campus/rooms", { method: "POST", body: { code: `OFF${suffix}`, name: "Off-campus rejected fixture", building: "Test", capacity: 30, spaceType: "lecture_room", latitude: 0, longitude: 0, isAvailable: true }, expect: 422 });
  const scheduleDemand = {
    course: course._id, department: department._id, cohort: `Smart ${suffix}`, lecturer: `Smart lecturer ${suffix}`,
    campus: "silverest", classSize: 20, weeklySessions: 2, durationMinutes: 60, roomType: "lecture_room", equipment: [],
  };
  const scheduleBody = { academicYear: "2026", semester: "1", demands: [scheduleDemand] };
  const beforeTimetableCount = await mongoose.connection.collection("timetableallocations").countDocuments();
  const planned = await request("/api/campus/auto-allocate", { method: "POST", body: { ...scheduleBody, demands: [scheduleDemand, { ...scheduleDemand, course: savedCourse._id, classSize: 10000 }] } });
  remember("campusschedulebatches", planned.previewId);
  assert.equal(planned.allocations.length, 2);
  assert.equal(planned.unscheduled.length, 2);
  assert.equal(await mongoose.connection.collection("timetableallocations").countDocuments(), beforeTimetableCount);
  await request("/api/campus/auto-allocate", { method: "PATCH", body: { previewId: planned.previewId }, expect: 422 });
  const committedPlan = await request("/api/campus/auto-allocate", { method: "PATCH", body: { previewId: planned.previewId, allowPartial: true } });
  for (const id of committedPlan.allocationIds) remember("timetableallocations", id);
  assert.equal(committedPlan.created, 2);
  assert.deepEqual((await request("/api/campus/auto-allocate", { method: "PATCH", body: { previewId: planned.previewId } })).allocationIds, committedPlan.allocationIds);
  const savedPlans = await mongoose.connection.collection("timetableallocations").find({ _id: { $in: committedPlan.allocationIds.map((id) => new mongoose.Types.ObjectId(id)) } }).toArray();
  assert.ok(savedPlans.every((row) => row.status === "draft" && row.classSize === 20 && row.roomType === "lecture_room"));
  assert.ok(!(await request("/api/integration/campus", { integration: true })).timetable.some((row) => committedPlan.allocationIds.includes(row._id)));
  await mongoose.connection.collection("timetableallocations").deleteMany({ _id: { $in: committedPlan.allocationIds.map((id) => new mongoose.Types.ObjectId(id)) } });
  const stalePlan = await request("/api/campus/auto-allocate", { method: "POST", body: scheduleBody });
  remember("campusschedulebatches", stalePlan.previewId);
  await request("/api/campus/rooms", { method: "PATCH", body: { _id: room._id, code: room.code, name: room.name, building: room.building, floor: 0, capacity: 31, spaceType: "lecture_room", latitude: room.latitude, longitude: room.longitude, equipment: [], description: "", isAvailable: true } });
  await request("/api/campus/auto-allocate", { method: "PATCH", body: { previewId: stalePlan.previewId }, expect: 409 });
  const noRoomPlan = await request("/api/campus/auto-allocate", { method: "POST", body: { ...scheduleBody, demands: [{ ...scheduleDemand, classSize: 10000 }] } });
  remember("campusschedulebatches", noRoomPlan.previewId);
  assert.equal(noRoomPlan.allocations.length, 0);
  assert.equal(noRoomPlan.unscheduled.length, 2);
  await request("/api/campus/auto-allocate", { method: "PATCH", body: { previewId: noRoomPlan.previewId }, expect: 422 });
  await mongoose.connection.collection("campusschedulebatches").updateOne({ _id: new mongoose.Types.ObjectId(noRoomPlan.previewId) }, { $set: { expiresAt: new Date(0) } });
  await request("/api/campus/auto-allocate", { method: "PATCH", body: { previewId: noRoomPlan.previewId }, expect: 410 });
  console.log("PASS campus bounds, smart preview/partial-draft guard, idempotency, stale previews, missing rooms and expiry");

  if (process.env.RUN_EXTERNAL_IMPORT_SMOKE === "1") {
    const preview = await request("/api/campus/imports", { method: "POST", body: { resource: "students", url: "https://jsonplaceholder.typicode.com/users", mapping: { studentId: "username", name: "name", email: "email" } } });
    remember("campusimportbatches", preview.previewId);
    assert.equal(preview.rows.length, 10);
    assert.equal(preview.counts.created + preview.counts.skipped, 10);
    console.log("PASS live HTTPS provider preview (public dummy data; no records imported)");
  }

  const date = new Date(Date.now() + 8 * 86400000);
  date.setUTCHours(8, 0, 0, 0); // 10:00 campus time, within the event notice window.
  const allocation = {
    academicYear: "2026", semester: "1", department: department._id, course: course._id, room: room._id,
    cohort: `Smoke ${suffix}`, lecturer: `Smoke Lecturer ${suffix}`, dayOfWeek: date.getUTCDay(),
    startTime: "10:00", endTime: "11:00", notes: "", status: "published",
  };
  await create("timetable", allocation, "timetableallocations");
  const body = { studentId: studentBody.studentId, roomId: room._id, title: "Smoke event", purpose: "Event", attendees: 10, startTime: date.toISOString(), endTime: new Date(date.getTime() + 3600000).toISOString() };
  await request("/api/integration/bookings", { method: "POST", integration: true, body, expect: 409 });
  body.startTime = new Date(date.getTime() + 3600000).toISOString();
  body.endTime = new Date(date.getTime() + 7200000).toISOString();
  const { booking } = await request("/api/integration/bookings", { method: "POST", integration: true, body });
  remember("bookings", booking._id);
  assert.equal(booking.status, "pending");
  assert.equal(booking.room._id, room._id);
  await request("/api/integration/bookings", { method: "POST", integration: true, body, expect: 409 });
  const approved = await request(`/api/campus/bookings/${booking._id}`, { method: "PATCH", body: { status: "confirmed" } });
  assert.equal(approved.booking.status, "confirmed");
  const edit = { ...body, startTime: new Date(date.getTime() + 7200000).toISOString(), endTime: new Date(date.getTime() + 10800000).toISOString() };
  assert.equal((await request(`/api/integration/bookings/${booking._id}`, { method: "PATCH", integration: true, body: edit })).booking.status, "pending");
  assert.equal((await request(`/api/integration/bookings/${booking._id}`, { method: "PATCH", integration: true, body: { studentId: studentBody.studentId } })).booking.status, "cancelled");
  await request(`/api/integration/bookings/${booking._id}`, { method: "PATCH", integration: true, body: edit, expect: 409 });
  console.log("PASS booking conflicts, adjacency, approval, update and cancellation");

  const again = (await request("/api/integration/bookings", { method: "POST", integration: true, body })).booking;
  remember("bookings", again._id);
  await request("/api/campus/timetable", { method: "POST", body: { ...allocation, startTime: "11:00", endTime: "12:00" }, expect: 409 });
  await create("timetable", { ...allocation, startTime: "11:05", endTime: "12:05" }, "timetableallocations");
  const bookings = (await request(`/api/integration/bookings?studentId=${studentBody.studentId}`, { integration: true })).bookings;
  assert.equal(bookings.find((item) => item._id === again._id)?.cancellationReason, "timetable_conflict");
  await request(`/api/campus/rooms?id=${room._id}`, { method: "DELETE", expect: 409 });
  const missing = await request(`/api/integration/bookings?studentId=MISSING${suffix}`, { integration: true, expect: 404 });
  assert.equal(missing.code, "STUDENT_NOT_FOUND");
  console.log("PASS timetable publication cancellation, reference guards and student not-found contract");

  const concurrentBody = { ...body, startTime: new Date(date.getTime() + 14400000).toISOString(), endTime: new Date(date.getTime() + 18000000).toISOString() };
  const results = await Promise.all([0, 1].map(async () => {
    const response = await fetch(`${base}/api/integration/bookings`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-student-app-key": process.env.STUDENT_APP_API_KEY },
      body: JSON.stringify(concurrentBody), signal: AbortSignal.timeout(90000),
    });
    const result = await response.json();
    if (result.booking) remember("bookings", result.booking._id);
    return response.status;
  }));
  assert.deepEqual(results.sort(), [200, 409]);
  console.log("PASS concurrent requests cannot double-book a room");

  const portalOnly = process.env.RUN_PORTAL_ONLY === "1";
  let studentRequest = async (path, body, expect = 200) => {
    assert.equal(path, "/api/assessments");
    return request(`/api/integration/assessments${body ? "" : `?studentId=${importStudent.studentId}`}`, {
      integration: true, expect, method: body ? "POST" : "GET",
      ...(body ? { body: { ...body, studentId: importStudent.studentId } } : {}),
    });
  };
  if (!portalOnly) {
  const studentBase = process.env.STUDENT_TEST_URL || "http://localhost:3000";
  const locations = await fetch(`${studentBase}/api/locations?query=${encodeURIComponent(room.code)}`, { signal: AbortSignal.timeout(30000) });
  assert.equal(locations.status, 200);
  const studentRoom = (await locations.json()).data.find((item) => item._id === room._id);
  assert.equal(studentRoom.latitude, -15.3554635);
  assert.deepEqual(studentRoom.location.coordinates, [28.4691588, -15.3554635]);
  const studentJar = new Map();
  const studentCsrfResponse = await fetch(`${studentBase}/api/auth/csrf`, { signal: AbortSignal.timeout(30000) });
  for (const cookie of studentCsrfResponse.headers.getSetCookie()) {
    const pair = cookie.split(";")[0], index = pair.indexOf("=");
    studentJar.set(pair.slice(0, index), pair.slice(index + 1));
  }
  const studentCsrf = await studentCsrfResponse.json();
  const studentSignin = await fetch(`${studentBase}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(30000),
    headers: { Cookie: [...studentJar].map(([key, value]) => `${key}=${value}`).join("; "), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: studentCsrf.csrfToken, studentId: importStudent.studentId, password: importedPassword, callbackUrl: studentBase, json: "true" }),
  });
  for (const cookie of studentSignin.headers.getSetCookie()) {
    const pair = cookie.split(";")[0], index = pair.indexOf("=");
    studentJar.set(pair.slice(0, index), pair.slice(index + 1));
  }
  const studentHeaders = { Cookie: [...studentJar].map(([key, value]) => `${key}=${value}`).join("; ") };
  const studentSession = await (await fetch(`${studentBase}/api/auth/session`, { headers: studentHeaders, signal: AbortSignal.timeout(30000) })).json();
  assert.equal(studentSession.user.studentId, importStudent.studentId);
  const studentCampusResponse = await fetch(`${studentBase}/api/campus-data`, { headers: studentHeaders, signal: AbortSignal.timeout(30000) });
  const studentCampus = await studentCampusResponse.json();
  assert.equal(studentCampusResponse.status, 200, studentCampus.error);
  assert.ok(studentCampus.timetable.some((row) => row.course?._id === course._id));
  assert.ok(studentCampus.announcements.some((row) => row._id === announcement._id));
  console.log("PASS live student app map coordinates, imported-account sign-in and campus-data proxy");

  studentRequest = async (path, body, expect = 200) => {
    const response = await fetch(`${studentBase}${path}`, {
      method: body ? "POST" : "GET", headers: { ...studentHeaders, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(90000),
    });
    const result = await response.json();
    assert.equal(response.status, expect, result.error);
    return result;
  };
  assert.equal((await studentRequest("/api/dashboard/profile")).profile.campus, "silverest");
  await request("/api/campus/programmes", { method: "PATCH", body: { ...programmeBody, _id: programme._id, campus: "leopards-hill" } });
  assert.equal((await studentRequest("/api/dashboard/profile")).profile.campus, "leopards-hill");
  await request("/api/campus/programmes", { method: "PATCH", body: { ...programmeBody, _id: programme._id } });
  const forgedProfile = await fetch(`${studentBase}/api/dashboard/profile`, { method: "PATCH", headers: { ...studentHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ campus: "leopards-hill", program: "FORGED" }) });
  assert.equal(forgedProfile.status, 403);
  const catalog = await (await fetch(`${studentBase}/api/programmes`)).json();
  assert.ok(catalog.programmes.some((item) => item.code === programme.code && item.campus === "silverest"));
  const registrationId = `9${Date.now().toString().slice(-9)}`;
  const registration = await fetch(`${studentBase}/api/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Registration Smoke", studentId: registrationId, email: `register-${suffix}@example.invalid`, password: randomBytes(18).toString("hex"), program: programme.code, campus: "leopards-hill", department: "FORGED", year: "1" }) });
  const registered = await registration.json();
  assert.equal(registration.status, 201, registered.error);
  remember("users", registered.user.id);
  assert.equal(registered.user.campus, "silverest");
  assert.equal(registered.user.department, department.code);
  console.log("PASS admin programme reassignment, authoritative profile, protected academic fields and derived self-registration campus");
  }
  await request("/api/campus/students", { method: "PATCH", body: { ...importStudent, _id: pendingStudent._id, program: programme.code, year: "1", status: "active" } });

  const examBody = {
    title: `Smoke exam ${suffix}`, kind: "exam", mode: "in_person", course: course._id, programme: programme.code, year: "1",
    cohort: `Exam ${suffix}`, lecturer: `Exam lecturer ${suffix}`, room: room._id, classSize: 20,
    startTime: new Date(date.getTime() + 7 * 3600000).toISOString(), endTime: new Date(date.getTime() + 8 * 3600000).toISOString(),
    durationMinutes: 60, status: "published", instructions: "Scheduled smoke fixture", questions: [],
  };
  const exam = await create("assessments", examBody);
  await request("/api/integration/bookings", { method: "POST", integration: true, body: { ...body, startTime: examBody.startTime, endTime: examBody.endTime }, expect: 409 });
  await request("/api/campus/timetable", { method: "POST", body: { ...allocation, cohort: `Other ${suffix}`, lecturer: `Other lecturer ${suffix}`, startTime: "17:00", endTime: "18:00" }, expect: 409 });
  if (!portalOnly) {
    const reservedRooms = await studentRequest(`/api/rooms?startsAt=${encodeURIComponent(examBody.startTime)}&endsAt=${encodeURIComponent(examBody.endTime)}`);
    assert.equal(reservedRooms.rooms.find((item) => item.id === room._id).isAvailable, false);
  }
  await request(`/api/campus/rooms?id=${room._id}`, { method: "DELETE", expect: 409 });
  const otherCampusExam = { ...examBody, startTime: new Date(date.getTime() + 9 * 3600000).toISOString(), endTime: new Date(date.getTime() + 10 * 3600000).toISOString(), room: null };
  await request("/api/campus/assessments", { method: "POST", body: otherCampusExam, expect: 422 });
  assert.ok((await studentRequest("/api/assessments")).assessments.some((item) => item.id === exam._id));
  console.log(`PASS published exams reserve rooms${portalOnly ? " through portal integration" : " in both apps"} and block timetable/booking overlaps`);

  const quizBody = {
    title: `Smoke quiz ${suffix}`, kind: "quiz", mode: "online", course: course._id, programme: programme.code, year: "",
    cohort: `Smoke quiz ${suffix}`, lecturer: `Quiz lecturer ${suffix}`, room: null, classSize: 1,
    startTime: new Date(Date.now() + 3600000).toISOString(), endTime: new Date(Date.now() + 7200000).toISOString(),
    durationMinutes: 30, status: "draft", instructions: "Synthetic smoke fixture", questions: [{ prompt: "Pick A", options: ["A", "B"], correctOption: 0, points: 3 }],
  };
  quizBody.year = "1";
  const quiz = await create("assessments", quizBody);
  assert.ok(!(await studentRequest("/api/assessments")).assessments.some((item) => item.id === quiz._id));
  await request("/api/campus/assessments", { method: "PATCH", body: { ...quizBody, _id: quiz._id, status: "published" } });
  await studentRequest("/api/assessments", { action: "start", assessmentId: quiz._id }, 409);
  await mongoose.connection.collection("assessments").updateOne({ _id: new mongoose.Types.ObjectId(quiz._id) }, { $set: { startTime: new Date(Date.now() - 60000) } });
  const started = await studentRequest("/api/assessments", { action: "start", assessmentId: quiz._id });
  const activeQuiz = started.assessments.find((item) => item.id === quiz._id);
  assert.equal(activeQuiz.questions.length, 1);
  assert.ok(!JSON.stringify(started).includes("correctOption"));
  assert.equal(activeQuiz.attempt.score, undefined);
  const attempt = await mongoose.connection.collection("assessmentattempts").findOne({ assessment: new mongoose.Types.ObjectId(quiz._id), student: new mongoose.Types.ObjectId(pendingStudent._id) });
  remember("assessmentattempts", String(attempt._id));
  await studentRequest("/api/assessments", { action: "start", assessmentId: quiz._id });
  assert.equal(await mongoose.connection.collection("assessmentattempts").countDocuments({ assessment: new mongoose.Types.ObjectId(quiz._id), student: new mongoose.Types.ObjectId(pendingStudent._id) }), 1);
  await studentRequest("/api/assessments", { action: "answer", assessmentId: quiz._id, question: 0, option: 0 });
  const submitted = await studentRequest("/api/assessments", { action: "submit", assessmentId: quiz._id });
  assert.equal(submitted.assessments.find((item) => item.id === quiz._id).questions.length, 0);
  assert.equal(submitted.assessments.find((item) => item.id === quiz._id).attempt.score, undefined);
  await studentRequest("/api/assessments", { action: "answer", assessmentId: quiz._id, question: 0, option: 1 }, 409);
  await studentRequest("/api/assessments", { action: "submit", assessmentId: quiz._id, ...(portalOnly ? { role: "admin" } : { studentId: studentBody.studentId }) }, 422);
  await request("/api/campus/assessments", { method: "PATCH", body: { ...quizBody, _id: quiz._id }, expect: 409 });
  await mongoose.connection.collection("assessments").updateOne({ _id: new mongoose.Types.ObjectId(quiz._id) }, { $set: { endTime: new Date(Date.now() - 1000) } });
  const marked = (await studentRequest("/api/assessments")).assessments.find((item) => item.id === quiz._id);
  assert.equal(marked.attempt.score, 3); assert.equal(marked.attempt.maximum, 3);
  const timedQuiz = await create("assessments", { ...quizBody, title: `Expiry quiz ${suffix}`, status: "published" });
  await mongoose.connection.collection("assessments").updateOne({ _id: new mongoose.Types.ObjectId(timedQuiz._id) }, { $set: { startTime: new Date(Date.now() - 60000) } });
  await studentRequest("/api/assessments", { action: "start", assessmentId: timedQuiz._id });
  await studentRequest("/api/assessments", { action: "answer", assessmentId: timedQuiz._id, question: 0, option: 0 });
  await mongoose.connection.collection("assessmentattempts").updateOne({ assessment: new mongoose.Types.ObjectId(timedQuiz._id), student: new mongoose.Types.ObjectId(pendingStudent._id) }, { $set: { deadline: new Date(Date.now() - 1000) } });
  await studentRequest("/api/assessments", { action: "answer", assessmentId: timedQuiz._id, question: 0, option: 1 }, 409);
  const expired = (await studentRequest("/api/assessments")).assessments.find((item) => item.id === timedQuiz._id);
  assert.ok(expired.attempt.submittedAt);
  const expiredResults = (await request("/api/campus/assessments")).results;
  assert.equal(expiredResults.find((result) => result.assessment === timedQuiz._id && result.student?._id === pendingStudent._id).score, 3);
  console.log("PASS private drafts, authoritative identity, timed single attempt, saved answers, immutable questions and delayed results");
} finally {
  await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 15000 });
  for (const attempt of await mongoose.connection.collection("assessmentattempts").find({ assessment: { $in: fixtures.get("assessments") ?? [] } }, { projection: { _id: 1 } }).toArray()) remember("assessmentattempts", String(attempt._id));
  for (const student of await mongoose.connection.collection("users").find({ studentId: { $in: importedStudents } }, { projection: { _id: 1 } }).toArray()) remember("users", String(student._id));
  for (const course of await mongoose.connection.collection("courses").find({ code: { $in: importedCourses } }, { projection: { _id: 1 } }).toArray()) remember("courses", String(course._id));
  for (const [collection, ids] of [...fixtures].reverse()) await mongoose.connection.collection(collection).deleteMany({ _id: { $in: ids } });
  await mongoose.disconnect();
  console.log("Smoke fixtures cleaned up.");
}
