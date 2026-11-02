import { requireStaff } from "@/lib/server/auth";
import { handler, rateLimit } from "@/lib/server/http";
import { uploadFolders, uploadImageFromRequest } from "@/lib/server/uploads";

export const POST = handler(async (request: Request) => {
  const staff = await requireStaff();
  rateLimit(`upload:${staff.id}`, 120, 10 * 60_000);
  return Response.json(await uploadImageFromRequest(request, uploadFolders.vehicles()), { status: 201 });
});