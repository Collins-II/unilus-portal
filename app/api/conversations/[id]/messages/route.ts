import { messageInput } from "@/lib/domain";
import { requireStaff } from "@/lib/server/auth";
import { addStaffReply } from "@/lib/server/conversations";
import { audit, getSettings } from "@/lib/server/data";
import { handler, rateLimit, readJson, requireObjectId } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export const POST = handler(async (request: Request, { params }: Context) => {
  const staff = await requireStaff();
  const id = requireObjectId((await params).id, "conversation");
  rateLimit(`reply:${staff.id}`, 30, 60_000);
  const { body } = messageInput.parse(await readJson(request));
  const message = await addStaffReply(await getSettings(), staff, id, body);
  await audit(staff, "conversation.reply", "Replied to a customer conversation", "conversation", id);
  return Response.json(message, { status: 201 });
});
