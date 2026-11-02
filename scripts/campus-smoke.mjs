import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { setServers } from "node:dns";

// Explicit opt-in: creates uniquely named fixtures in the configured shared database, then removes only those IDs.
if (process.env.RUN_CAMPUS_SMOKE !== "1") throw new Error("Set RUN_CAMPUS_SMOKE=1 to run campus API smoke tests.");
const base = process.env.CAMPUS_TEST_URL || "http://localhost:3001";
const suffix = randomBytes(5).toString("hex").toUpperCase();
const cookieJar = new Map();
const fixtures = new Map();
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
try {
  assert.ok(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD, "Bootstrap admin credentials are required for this smoke test.");
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
  await request("/api/integration/campus", { expect: 401 });
  console.log("PASS staff authentication and campus workspace");

  const department = await create("departments", { code: `T${suffix}`, name: `Smoke department ${suffix}` });
  const course = await create("courses", { code: `T${suffix}`, title: "Smoke course", department: department._id });
  const room = await create("rooms", { code: `T${suffix}`, name: `Smoke lecture room ${suffix}`, building: "Test", floor: 0, capacity: 30, spaceType: "lecture_room", latitude: -15.4, longitude: 28.3, description: "", equipment: [], isAvailable: true });
  const studentBody = { studentId: `T${suffix}`, name: "Smoke Student", email: `campus-smoke-${suffix.toLowerCase()}@example.invalid`, password: randomBytes(18).toString("hex"), department: department.code, program: "Smoke", year: "1", phone: "", status: "active" };
  await create("students", studentBody, "users");
  const announcementBody = { title: `Smoke ${suffix}`, message: "Campus smoke test", priority: "normal", status: "draft" };
  const announcement = await create("announcements", announcementBody);
  const campusDraft = await request("/api/integration/campus", { integration: true });
  assert.ok(!campusDraft.announcements.some((item) => item._id === announcement._id));
  await request("/api/campus/announcements", { method: "PATCH", body: { ...announcementBody, _id: announcement._id, status: "published" } });
  assert.ok((await request("/api/integration/campus", { integration: true })).announcements.some((item) => item._id === announcement._id));
  console.log("PASS campus resource creation and draft/published visibility");

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
  await create("timetable", { ...allocation, startTime: "11:00", endTime: "12:00" }, "timetableallocations");
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
} finally {
  await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 15000 });
  for (const [collection, ids] of [...fixtures].reverse()) await mongoose.connection.collection(collection).deleteMany({ _id: { $in: ids } });
  await mongoose.disconnect();
  console.log("Smoke fixtures cleaned up.");
}
