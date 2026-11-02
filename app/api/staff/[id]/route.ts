import { Staff } from "@/lib/database/models";
import { staffUpdateInput } from "@/lib/domain";
import { hashPassword, requireStaff } from "@/lib/server/auth";
import { audit } from "@/lib/server/data";
import { handler, HttpError, readJson, requireObjectId } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, { params }: Context) => {
  const admin = await requireStaff("admin");
  const id = requireObjectId((await params).id, "account");
  const { password, ...changes } = staffUpdateInput.parse(await readJson(request));
  const user = await Staff.findById(id);
  if (!user) throw new HttpError(404, "This account could not be found.");
  const demoting = (changes.role && changes.role !== "admin") || changes.active === false;
  if (user.role === "admin" && user.active && demoting && (await Staff.countDocuments({ role: "admin", active: true })) <= 1) {
    throw new HttpError(409, "At least one active administrator is required.");
  }
  user.set(changes);
  if (password) user.set({ passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: undefined });
  await user.save();
  await audit(admin, password ? "staff.password-reset" : "staff.update", `${password ? "Reset the password for" : "Updated account"} ${user.email}`, "staff", id);
  return { ok: true };
});
