import { ConversationModel } from "@/lib/database/models";
import { requireStaff } from "@/lib/server/auth";
import { toConversation } from "@/lib/server/conversations";
import { handler } from "@/lib/server/http";

export const GET = handler(async (request: Request) => {
  await requireStaff();
  const status = new URL(request.url).searchParams.get("status");
  const filter = status === "open" || status === "closed" ? { status } : {};
  const conversations = await ConversationModel.find(filter).sort({ lastMessageAt: -1 }).limit(300).lean();
  return conversations.map(toConversation);
});
