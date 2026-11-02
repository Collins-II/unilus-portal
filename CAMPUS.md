# UNILUS campus administration

The active `/` workspace manages campus locations (including map coordinates), departments, courses, recurring teaching allocations, announcements, student accounts and room-booking approvals. The navy/blue dashboard replaces the dealership shell. Legacy dealership files/endpoints remain for compatibility, but are not used by the campus workspace.

## Configuration

Run `npm run dev` on port **3001**; the student application runs on **3000**.

Both apps **must use the same MongoDB cluster and database name**, not merely the same cluster. Set portal `MONGODB_URL` and the student's MongoDB variable to that identical connection URI. Campus collections are explicitly `rooms`, `users`, `bookings`, `departments`, `courses`, `timetableallocations`, and `announcements`. Room documents preserve the student's GeoJSON/latitude/longitude fields. Only `spaceType: "lecture_room"` can be booked.

MongoDB must support transactions (Atlas or a replica set). Booking, room and timetable mutations use transactions and a shared `campusschedulelocks` document to prevent concurrent overlapping approvals/requests/publications. Pending and confirmed requests both reserve their timeslot. The lock collection is internal and must not be deleted while requests are running.

Set the **same**, high-entropy `STUDENT_APP_API_KEY` in both apps. The student server uses `ADMIN_APP_URL=http://localhost:3001`. Never expose this key via `NEXT_PUBLIC_*` or browser requests.

Portal authentication remains the existing NextAuth credential provider with `Staff` records in the separate `staffs` collection. Existing accounts/password hashes and `admin`/`staff` roles are unchanged. Student credentials use `users.password` (bcrypt), never staff accounts. Existing distinct portal session-cookie naming is preserved; use a different student `NEXTAUTH_SECRET`. Portal `NEXTAUTH_URL=http://localhost:3001`, student `NEXTAUTH_URL=http://localhost:3000`. To bootstrap the first portal administrator only, set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and optionally `ADMIN_NAME`; remove the bootstrap password after login.

All staff can view campus records, manage locations/academic information and approve/cancel bookings. Only administrators can create/edit/deactivate student accounts. Students cannot be deleted; deactivation preserves history. Referenced departments, courses and rooms cannot be deleted. Cancel upcoming bookings and unpublish a room's allocations before marking it unavailable.

## Student integration API

Every endpoint requires `x-student-app-key`. Responses are uncached JSON. Missing/incorrect keys return 401; missing integration configuration returns 503. Validation errors return 422, conflicts 409, missing resources 404.

* `GET /api/integration/campus`: `{ timetable, announcements, departments }`. Only **published** timetable allocations and announcements are returned. Timetable references populate department (`_id,code,name`), course (`_id,code,title`) and room (`_id,name,building`); timetable fields include academicYear, semester, cohort, lecturer, dayOfWeek (Sunday=0), startTime/endTime (`HH:mm`), notes. Announcements include `_id,title,message,priority,createdAt`; departments include `_id,code,name`.
* `GET /api/integration/bookings?studentId=...`: `{ bookings }` for that active student, with populated rooms.
* `POST /api/integration/bookings`: `{ studentId, roomId, purpose, title, attendees, startTime, endTime, tutorialGroup?, conversationId? }` → `{ booking }`, status `pending`. Dates must be ISO datetimes with timezone. Purpose is exactly `Tutorial Group` or `Event`. Tutorial details require `{groupName,courseCode,topic,leaderName}`.
* `PATCH /api/integration/bookings/:id`: `{ studentId }` (the student's existing delete/cancel contract) or `{studentId,status:"cancelled"}` cancels. Otherwise submit the full POST fields to request changes; status resets to `pending`. Ownership is checked. Cancelled bookings cannot be edited; an attached Study Circle cannot be changed.

Bookings require active students, an available lecture room, capacity sufficient for attendees, at least 48 hours' notice for tutorials, and 7–14 days' notice for events (inclusive). Campus hours are 07:00–21:00 **Africa/Lusaka**, on one local calendar day. They cannot overlap pending/confirmed bookings or published recurring teaching allocations. Adjacent timeslots are allowed. Staff approval rechecks availability, capacity and conflicts without applying a new request-notice window.

Publishing a timetable allocation rejects room, lecturer or cohort clashes and automatically cancels conflicting upcoming student bookings with `cancellationReason: "timetable_conflict"`. Staff cancellations use `"staff_cancelled"`; students use `"student_cancelled"`. The student app reads shared bookings directly, so status changes are immediately reflected.

## Staff API

`GET /api/campus` returns workspace records and the staff identity. `POST/PATCH /api/campus/{rooms|departments|courses|timetable|announcements|students}` creates/updates a validated record (PATCH includes `_id`). `DELETE` on that route takes `?id=...` and enforces reference protection. `PATCH /api/campus/bookings/:id` accepts `{status:"confirmed"|"cancelled"}`. All staff routes revalidate the session and active staff account; student mutation routes additionally require admin.

## Validation

Run `npm run typecheck`, `npm run lint`, `npm run build`, and `node --experimental-strip-types --test lib\campus\policy.test.ts`. Existing installed Next 16.1.1 does not contain `node_modules\next\dist\docs`; that location was checked before implementation.

With the portal running, `RUN_CAMPUS_SMOKE=1` and configured bootstrap admin credentials, run `node --env-file=.env --env-file=.env.local scripts\campus-smoke.mjs`. It tests authenticated CRUD, publication visibility, booking creation/conflicts/approval/edits/cancellation, timetable-driven cancellation, reference protection, missing-student errors, and concurrent requests. It creates uniquely named fixtures in the shared database and removes only those IDs in `finally`. Do not interrupt it before cleanup.
