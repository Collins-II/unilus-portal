import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { type ClientSession } from "mongoose";
import { hashPassword } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/http";
import { Course, Department, ImportBatch, Programme, Student, Timetable } from "./models";
import { importRows, type ImportedRows } from "./import-policy";
import { roomTransaction } from "./service";
import { programmeAssignment } from "./programme-service";
import { Assessment } from "./assessment-models";

type Action = { identity: string; label: string; action: "create" | "update" | "skip"; id?: string; departmentId?: string };
type Counts = { created: number; updated: number; skipped: number };
function summary(actions: Action[]): Counts {
  return {
    created: actions.filter((row) => row.action === "create").length,
    updated: actions.filter((row) => row.action === "update").length,
    skipped: actions.filter((row) => row.action === "skip").length,
  };
}

async function planImport(input: ImportedRows, updateExisting: boolean, session: ClientSession | null = null) {
  const actions: Action[] = [];
  let snapshot: unknown;
  if (input.resource === "students") {
    const records = await Student.find({ $or: [
      { studentId: { $in: input.rows.map((row) => row.studentId) } },
      { email: { $in: input.rows.map((row) => row.email) } },
    ] }).select("studentId email name role status updatedAt").sort({ _id: 1 }).session(session).lean();
    for (const row of input.rows) {
      const existing = records.find((record) => record.studentId === row.studentId);
      if (existing && existing.role !== "student") throw new HttpError(409, `Student ID ${row.studentId} belongs to a non-student account.`);
      const emailOwner = records.find((record) => record.email === row.email);
      if (emailOwner && String(emailOwner._id) !== String(existing?._id)) throw new HttpError(409, `Email ${row.email} is already assigned to another account.`);
      actions.push({ identity: row.studentId, label: row.name, action: existing ? updateExisting ? "update" : "skip" : "create", ...(existing ? { id: String(existing._id) } : {}) });
    }
    const programmes = await Programme.find({ code: { $in: input.rows.map((row) => row.program?.toUpperCase()).filter(Boolean) } }).sort({ _id: 1 }).session(session).lean();
    const departments = await Department.find({ _id: { $in: programmes.map((programme) => programme.department) } }).sort({ _id: 1 }).session(session).lean();
    snapshot = { records, programmes, departments };
  } else {
    const departments = await Department.find({ code: { $in: input.rows.map((row) => row.department) } }).sort({ _id: 1 }).session(session).lean();
    const records = await Course.find({ code: { $in: input.rows.map((row) => row.code) } }).sort({ _id: 1 }).session(session).lean();
    for (const row of input.rows) {
      const department = departments.find((record) => record.code === row.department);
      if (!department) throw new HttpError(422, `Department ${row.department} does not exist. Create it before importing courses.`);
      const existing = records.find((record) => record.code === row.code);
      if (existing && updateExisting && String(existing.department) !== String(department._id) && await Assessment.exists({ course: existing._id }).session(session)) throw new HttpError(409, `Course ${row.code} has assessment history; its department cannot be changed.`);
      if (existing && updateExisting && String(existing.department) !== String(department._id) &&
        await Timetable.exists({ course: existing._id, department: { $ne: department._id } }).session(session)) {
        throw new HttpError(409, `Course ${row.code} has timetable allocations. Remove them before changing its department.`);
      }
      actions.push({
        identity: row.code, label: row.title, action: existing ? updateExisting ? "update" : "skip" : "create",
        departmentId: String(department._id), ...(existing ? { id: String(existing._id) } : {}),
      });
    }
    snapshot = { records, departments };
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({ snapshot, actions })).digest("hex");
  return { actions, fingerprint, counts: summary(actions) };
}

export async function previewImport(owner: string, rows: ImportedRows, updateExisting: boolean) {
  const plan = await planImport(rows, updateExisting);
  const batch = await ImportBatch.create({
    owner, ...rows, updateExisting, fingerprint: plan.fingerprint,
    expiresAt: new Date(Date.now() + 15 * 60_000),
  });
  return { previewId: String(batch._id), expiresAt: batch.expiresAt, counts: plan.counts, rows: plan.actions.map((action, index) => ({ ...action, values: rows.rows[index] })) };
}

export async function commitImport(owner: string, id: string) {
  // Pending imports cannot be used to sign in; staff must replace this unknown password.
  const pendingPassword = await hashPassword(randomBytes(32).toString("hex"));
  return roomTransaction([], async (session) => {
    const batch = await ImportBatch.findOne({ _id: id, owner }).session(session);
    if (!batch) throw new HttpError(404, "Import preview not found.");
    if (batch.expiresAt <= new Date()) throw new HttpError(409, "This preview has expired. Fetch a new preview.");
    if (batch.status === "completed") return { counts: batch.result };
    const input = importRows.parse({ resource: batch.resource, rows: batch.rows });
    const plan = await planImport(input, batch.updateExisting, session);
    if (plan.fingerprint !== batch.fingerprint) throw new HttpError(409, "Campus records changed after this preview. Fetch a new preview before importing.");
    for (let index = 0; index < input.rows.length; index++) {
      const action = plan.actions[index];
      if (action.action === "skip") continue;
      if (input.resource === "students") {
        const row = input.rows[index];
        const assignment = row.program && await Programme.exists({ code: row.program.toUpperCase() }).session(session) ? await programmeAssignment(row.program, session) : {};
        if (action.id) await Student.updateOne({ _id: action.id, role: "student" }, { $set: { ...row, ...assignment, ...(row.program !== undefined && !Object.keys(assignment).length ? { campus: null } : {}) } }, { session, runValidators: true });
        else await Student.create([{ ...row, ...assignment, password: pendingPassword, passwordSetupRequired: true, role: "student", status: "pending" }], { session });
      } else {
        const row = { ...input.rows[index], department: action.departmentId };
        if (action.id) await Course.updateOne({ _id: action.id }, { $set: row }, { session, runValidators: true });
        else await Course.create([row], { session });
      }
    }
    batch.status = "completed";
    batch.result = plan.counts;
    await batch.save({ session });
    return { counts: plan.counts };
  });
}
