# UNILUS campus administration

The active `/` workspace manages campus locations, departments, courses, study programmes, smart teaching allocations, announcements, student accounts and room-booking approvals. `/assessments` manages quizzes, tests and exams. UNILUS navy/blue branding and existing data remain unchanged. Legacy dealership modules are dormant compatibility code.

## Configuration

Run `npm run dev` on port **3001**; the student application runs on **3000**.

Both apps **must use the same MongoDB cluster and database name**, not merely the same cluster. Set portal `MONGODB_URL` and the student's MongoDB variable to that identical connection URI. Campus collections are explicitly `rooms`, `users`, `bookings`, `departments`, `courses`, `timetableallocations`, and `announcements`. Room documents preserve the student's GeoJSON/latitude/longitude fields. Only `spaceType: "lecture_room"` can be booked.

MongoDB must support transactions (Atlas or a replica set). Booking, room and timetable mutations use transactions and a shared `campusschedulelocks` document to prevent concurrent overlapping approvals/requests/publications. Pending and confirmed requests both reserve their timeslot. The lock collection is internal and must not be deleted while requests are running.

Set the **same**, high-entropy `STUDENT_APP_API_KEY` in both apps. The student server uses `ADMIN_APP_URL=http://localhost:3001`. Never expose this key via `NEXT_PUBLIC_*` or browser requests.

Portal authentication remains the existing NextAuth credential provider with `Staff` records in the separate `staffs` collection. Existing accounts/password hashes and `admin`/`staff` roles are unchanged. Student credentials use `users.password` (bcrypt), never staff accounts. Existing distinct portal session-cookie naming is preserved; use a different student `NEXTAUTH_SECRET`. Portal `NEXTAUTH_URL=http://localhost:3001`, student `NEXTAUTH_URL=http://localhost:3000`. To bootstrap the first portal administrator only, set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and optionally `ADMIN_NAME`; remove the bootstrap password after login.

All staff can view campus records, manage locations/academic information and approve/cancel bookings. Only administrators can manage programmes, student accounts, assessments and external imports. Students cannot be deleted; deactivation preserves history. Referenced departments, courses and rooms cannot be deleted. Cancel upcoming bookings and unpublish a room's allocations before marking it unavailable.

Visit `/setup` for first-administrator instructions; it never creates an account or exposes server credentials. Bootstrap passwords must meet the existing staff-password policy (at least 10 characters).

## Launch requirements and campus data

The shared campus IDs are `silverest`, `massmedia`, and `leopards-hill`. The room picker, API validation, programme assignment and scheduler use the same geography module. Silverest and Leopards Hill use community OpenStreetMap navigation outlines. Massmedia uses an explicitly labelled approximate Alick Nkhata Road view area, not a verified boundary; it has no fabricated polygon or outside-area map mask. Scope validation is not proof of campus ownership. Verify all room pins on site. Existing off-scope locations remain visible for correction, not silently moved or deleted. Browser geolocation requires HTTPS or localhost and explicit permission. OpenStreetMap tiles require network access; verified manual coordinates remain available.

Before enabling student registration, administrators must populate the real UNILUS department and programme catalogue and explicitly assign every programme to its verified campus. No official programme/student mappings or demo records are supplied. Existing legacy programme text is preserved until deliberately reassigned. A programme selection derives the student's department and campus server-side; clients cannot forge a campus.

The database also uses `programmes`, `assessments`, `assessmentattempts`, `campusimportbatches`, and `campusschedulebatches`. MongoDB transactions are required. Preview batches expire after 15 minutes; do not delete the shared scheduling lock.

## Imports, smart allocation and assessments

Student/course imports read an HTTPS JSON API using explicit field mappings. Preview before committing; choose whether to update existing records. Private/reserved addresses, redirects, oversized responses and invalid rows are rejected. Tokens are used only for the outbound request and are not persisted. A batch commits atomically and rejects stale previews. New students are pending with an unknown password and cannot be activated until staff sets a password; existing passwords are retained.

Smart allocation uses verified teaching rooms, capacity, equipment, room type, cohort/lecturer conflicts, bookings and conservative transfer-time estimates. It searches weekdays 08:00–17:00, excluding lunch 12:00–13:00. Preview first; saving creates drafts without replacing existing allocations. Partial schedules require explicit acceptance. Review actual routes, accessibility and inter-campus transport before publication; straight-line walking estimates are not routing instructions.

Assessments target an administrator-managed programme and exact student year. In-person publication reserves a suitable room and checks teaching/booking clashes. Online multiple-choice attempts use server deadlines, automatic marking and delayed score release after the window closes. Started assessments and assessments with attempts are immutable.

## Student integration API

Every endpoint requires `x-student-app-key`. Responses are uncached JSON. Missing/incorrect keys return 401; missing integration configuration returns 503. Validation errors return 422, conflicts 409, missing resources 404.

* `GET /api/integration/campus`: `{ timetable, announcements, departments }`. Only **published** timetable allocations and announcements are returned. Timetable references populate department (`_id,code,name`), course (`_id,code,title`) and room (`_id,name,building`); timetable fields include academicYear, semester, cohort, lecturer, dayOfWeek (Sunday=0), startTime/endTime (`HH:mm`), notes. Announcements include `_id,title,message,priority,createdAt`; departments include `_id,code,name`.
* `GET /api/integration/bookings?studentId=...`: `{ bookings }` for that active student, with populated rooms.
* `GET /api/integration/programmes`: administrator-managed `{ programmes }`, with populated department and explicit campus.
* `GET /api/integration/assessments?studentId=...`: available assessments and that student's attempts; answer keys are never returned.
* `POST /api/integration/assessments`: `{ studentId, assessmentId, action: "start"|"submit" }` or `{ studentId, assessmentId, action: "answer", question, option }`.
* `POST /api/integration/bookings`: `{ studentId, roomId, purpose, title, attendees, startTime, endTime, tutorialGroup?, conversationId? }` → `{ booking }`, status `pending`. Dates must be ISO datetimes with timezone. Purpose is exactly `Tutorial Group` or `Event`. Tutorial details require `{groupName,courseCode,topic,leaderName}`.
* `PATCH /api/integration/bookings/:id`: `{ studentId }` (the student's existing delete/cancel contract) or `{studentId,status:"cancelled"}` cancels. Otherwise submit the full POST fields to request changes; status resets to `pending`. Ownership is checked. Cancelled bookings cannot be edited; an attached Study Circle cannot be changed.

Bookings require active students, an available lecture room, capacity sufficient for attendees, at least 48 hours' notice for tutorials, and 7–14 days' notice for events (inclusive). Campus hours are 07:00–21:00 **Africa/Lusaka**, on one local calendar day. They cannot overlap pending/confirmed bookings or published recurring teaching allocations. Adjacent timeslots are allowed. Staff approval rechecks availability, capacity and conflicts without applying a new request-notice window.

Publishing a timetable allocation rejects room, lecturer or cohort clashes and automatically cancels conflicting upcoming student bookings with `cancellationReason: "timetable_conflict"`. Staff cancellations use `"staff_cancelled"`; students use `"student_cancelled"`. The student app reads shared bookings directly, so status changes are immediately reflected.

## Staff API

`GET /api/campus` returns workspace records and the staff identity. `POST/PATCH /api/campus/{rooms|departments|courses|programmes|timetable|announcements|students}` creates/updates a validated record (PATCH includes `_id`). `DELETE` takes `?id=...` and enforces history/reference protection. `PATCH /api/campus/bookings/:id` accepts `{status:"confirmed"|"cancelled"}`. All staff routes revalidate the session and active account.

`POST/PATCH /api/campus/imports` previews/commits imports (admin). `POST/PATCH /api/campus/auto-allocate` previews/commits smart allocation (admin). `GET /api/campus/assessments` lists assessments/results; `POST/PATCH` creates/updates them (admin). `GET /api/admin/bootstrap` reports configuration to an authenticated administrator only.

## Validation

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Unit tests use Node's experimental TypeScript transformation/module mocking (Node 24 recommended). The Next 16.4.5 source route-handler guide was reviewed before porting.

With both apps running, `RUN_CAMPUS_SMOKE=1` and configured bootstrap admin credentials, run `node --env-file=.env --env-file=.env.local scripts\campus-smoke.mjs`. `CAMPUS_TEST_URL` and `STUDENT_TEST_URL` optionally select isolated test ports (defaults 3001/3000). It tests authenticated CRUD, publication visibility, import activation/idempotency/rollback, smart allocation, booking concurrency, programme-derived registration, assessment reservations, timed attempts and delayed results across both apps. `RUN_PORTAL_ONLY=1` skips student-app-specific checks but still tests assessment integration endpoints directly; it is not a substitute for full cross-app validation. It creates uniquely named fixtures in the shared database and removes only those IDs in `finally`. Do not interrupt it before cleanup. Use freshly started production servers after schema changes; existing development workers may retain old Mongoose models.
