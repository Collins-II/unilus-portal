import { Staff } from "@/lib/database/models";
import { staffInput, type StaffMember } from "@/lib/domain";
import { hashPassword, requireStaff } from "@/lib/server/auth";
import { audit } from "@/lib/server/data";
import { handler, readJson } from "@/lib/server/http";

const toStaff = (doc: Record<string, any>): StaffMember => ({
  id: doc._id.toString(), name: doc.name, email: doc.email, role: doc.role, active: doc.active !== false,
  lastLoginAt: doc.lastLoginAt ? new Date(doc.lastLoginAt).toISOString() : undefined,
});

export const GET = handler(async () => {
  await requireStaff("admin");
  return (await Staff.find().sort({ createdAt: 1 }).lean()).map(toStaff);
});

export const POST = handler(async (request: Request) => {
  const admin = await requireStaff("admin");
  const { password, ...input } = staffInput.parse(await readJson(request));
  const user = await Staff.create({ ...input, passwordHash: await hashPassword(password) });
  await audit(admin, "staff.create", `Added ${input.role} account for ${input.email}`, "staff", user._id.toString());
  return Response.json(toStaff(user.toObject()), { status: 201 });
});
