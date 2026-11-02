import { AuditModel } from "@/lib/database/models";
import type { AuditEntry } from "@/lib/domain";
import { requireStaff } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";

export const GET = handler(async (): Promise<AuditEntry[]> => {
  await requireStaff("admin");
  const entries = await AuditModel.find().sort({ createdAt: -1 }).limit(100).lean();
  return entries.map((entry) => ({ id: entry._id.toString(), actor: entry.actor ?? "System", action: entry.action, summary: entry.summary ?? "", createdAt: new Date(entry.createdAt).toISOString() }));
});
