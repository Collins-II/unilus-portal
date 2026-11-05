import { requireStaff } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";

// Administrator creation remains restricted to the existing credential sign-in flow.
export const GET = handler(async () => {
  const staff = await requireStaff("admin");
  return { configured: true, administrator: { id: staff.id, name: staff.name }, integrationConfigured: Boolean(process.env.STUDENT_APP_API_KEY) };
});