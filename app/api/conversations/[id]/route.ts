import { ConversationModel } from "@/lib/database/models";
import { conversationStatusInput } from "@/lib/domain";
import { requireStaff } from "@/lib/server/auth";
import { conversationMessages, toConversation } from "@/lib/server/conversations";
import { audit } from "@/lib/server/data";
import { handler, HttpError, readJson, requireObjectId } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, { params }: Context) => {
  await requireStaff();
  const id = requireObjectId((await params).id, "conversation");
  const conversation = await ConversationModel.findByIdAndUpdate(id, { unreadByStaff: 0 }, { new: true }).lean();
  if (!conversation) throw new HttpError(404, "This conversation could not be found.");
  return { conversation: toConversation(conversation), messages: await conversationMessages(id) };
});

export const PATCH = handler(async (request: Request, { params }: Context) => {
  const staff = await requireStaff();
  const id = requireObjectId((await params).id, "conversation");
  const { status } = conversationStatusInput.parse(await readJson(request));
  const conversation = await ConversationModel.findByIdAndUpdate(id, { status }, { new: true }).lean();
  if (!conversation) throw new HttpError(404, "This conversation could not be found.");
  await audit(staff, "conversation.status", `Marked conversation "${conversation.subject}" as ${status}`, "conversation", id);
  return toConversation(conversation);
});
