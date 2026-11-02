import { VehicleModel } from "@/lib/database/models";
import { messageInput } from "@/lib/domain";
import { addCustomerMessage, conversationMessages, findConversationByToken } from "@/lib/server/conversations";
import { getSettings, toPublicVehicle } from "@/lib/server/data";
import { clientIp, preflight, publicHandler, rateLimit, readJson } from "@/lib/server/http";

type Context = { params: Promise<{ token: string }> };

export const GET = publicHandler(async (request: Request, { params }: Context) => {
  rateLimit(`thread:${clientIp(request)}`, 120, 60_000);
  const settings = await getSettings();
  const conversation = await findConversationByToken((await params).token);
  const vehicle = conversation.vehicleId ? await VehicleModel.findById(conversation.vehicleId).lean() : null;
  const messages = await conversationMessages(conversation._id.toString());
  return {
    conversation: { subject: conversation.subject, status: conversation.status, customerName: conversation.customer?.name ?? "", dealership: settings.dealership, vehicle: vehicle ? toPublicVehicle(vehicle) : null },
    messages: messages.map(({ id, sender, authorName, body, createdAt }) => ({ id, sender, authorName, body, createdAt })),
  };
});

export const POST = publicHandler(async (request: Request, { params }: Context) => {
  rateLimit(`thread-post:${clientIp(request)}`, 10, 10 * 60_000);
  const { body } = messageInput.parse(await readJson(request));
  const message = await addCustomerMessage(await getSettings(), (await params).token, body);
  const { id, sender, authorName, createdAt } = message;
  return { id, sender, authorName, body: message.body, createdAt };
});

export const OPTIONS = preflight;
