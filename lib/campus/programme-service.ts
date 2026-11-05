import "server-only";
import type { ClientSession } from "mongoose";
import { Department, Programme } from "./models";
import { HttpError } from "@/lib/server/http";

export async function programmeAssignment(program: string, session?: ClientSession) {
  const programme = await Programme.findOne({ code: program.trim().toUpperCase() }).session(session ?? null).lean();
  if (!programme) throw new HttpError(422, "Select a programme from the administrator-managed catalogue.");
  const department = await Department.findById(programme.department).session(session ?? null).lean();
  if (!department) throw new HttpError(422, "The programme department is unavailable.");
  return { program: programme.code, department: department.code, campus: programme.campus };
}
