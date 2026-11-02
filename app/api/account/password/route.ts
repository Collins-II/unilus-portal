import bcrypt from "bcryptjs";
import { Staff } from "@/lib/database/models";
import { passwordChangeInput } from "@/lib/domain";
import { hashPassword, requireStaff } from "@/lib/server/auth";
import { audit } from "@/lib/server/data";
import { handler, HttpError, rateLimit, readJson } from "@/lib/server/http";

export const POST = handler(async (request: Request) => {
  const me = await requireStaff();
  rateLimit(`password:${me.id}`, 5, 15 * 60_000);
  const { current, next } = passwordChangeInput.parse(await readJson(request));
  const user = await Staff.findById(me.id).select("+passwordHash");
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) throw new HttpError(422, "Your current password is incorrect.");
  user.passwordHash = await hashPassword(next);
  await user.save();
  await audit(me, "account.password", "Changed account password", "staff", me.id);
  return { ok: true };
});
