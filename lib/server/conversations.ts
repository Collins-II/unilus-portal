import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ConversationModel, LeadModel, MessageModel } from "@/lib/database/models";
import type { ConversationSummary, Settings } from "@/lib/domain";
import type { StaffSession } from "@/lib/server/auth";
import { clientUrl, HttpError } from "@/lib/server/http";
import { alertStaff, confirmToCustomer, deliverReply } from "@/lib/server/messaging";
import { toMessage, today } from "@/lib/server/data";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const tokenKey = () => {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to secure conversation links.");
  return createHash("sha256").update(`conversation-link:${secret}`).digest();
};
function sealToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
}
function openToken(sealed: string) {
  const [iv, tag, data] = sealed.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
export const threadUrl = (token: string) => `${clientUrl()}/messages/${token}`;
const preview = (body: string) => body.replace(/\s+/g, " ").slice(0, 140);

export function toConversation(doc: Record<string, any>): ConversationSummary {
  return {
    id: doc._id.toString(), subject: doc.subject, status: doc.status,
    customer: { name: doc.customer?.name ?? "", email: doc.customer?.email ?? "", phone: doc.customer?.phone ?? "" },
    vehicleId: doc.vehicleId ?? "", leadId: doc.leadId ?? "", unread: doc.unreadByStaff ?? 0,
    lastMessageAt: new Date(doc.lastMessageAt).toISOString(), preview: doc.preview ?? "",
  };
}

/** Records a website enquiry as a lead plus a private conversation thread, then notifies staff and customer. */
export async function startConversation(settings: Settings, input: { name: string; email: string; phone: string; subject: string; body: string; vehicleId: string }) {
  let lead = await LeadModel.findOne({ email: input.email, vehicleId: input.vehicleId, stage: { $nin: ["Won", "Lost"] } });
  if (!lead) lead = await LeadModel.create({ name: input.name, email: input.email, phone: input.phone, vehicleId: input.vehicleId, source: "Website", message: input.body, created: today() });
  else if (input.phone && !lead.phone) {
    lead.phone = input.phone;
    await lead.save();
  }

  const token = randomBytes(24).toString("base64url");
  const conversation = await ConversationModel.create({
    tokenHash: hashToken(token), tokenSealed: sealToken(token), subject: input.subject, customer: { name: input.name, email: input.email, phone: input.phone },
    vehicleId: input.vehicleId, leadId: lead._id.toString(), unreadByStaff: 1, lastMessageAt: new Date(), preview: preview(input.body),
  });
  if (!lead.conversationId) {
    lead.conversationId = conversation._id.toString();
    await lead.save();
  }
  const url = threadUrl(token);
  const [staffDelivery, customerEmail] = await Promise.all([
    alertStaff(settings, { subject: input.subject, customer: input, body: input.body, conversationId: conversation._id.toString() }),
    confirmToCustomer(settings, { name: input.name, email: input.email, subject: input.subject, body: input.body, threadUrl: url }),
  ]);
  await MessageModel.create({ conversationId: conversation._id, sender: "customer", authorName: input.name, body: input.body, delivery: { email: staffDelivery.email, sms: staffDelivery.sms } });
  return { conversationId: conversation._id.toString(), leadId: lead._id.toString(), token, threadUrl: url, confirmation: customerEmail };
}

export async function findConversationByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new HttpError(404, "This conversation could not be found.");
  const conversation = await ConversationModel.findOne({ tokenHash: hashToken(token) });
  if (!conversation) throw new HttpError(404, "This conversation could not be found.");
  return conversation;
}

export async function conversationMessages(conversationId: string) {
  const messages = await MessageModel.find({ conversationId }).sort({ createdAt: 1 }).limit(500).lean();
  return messages.map(toMessage);
}

export async function addCustomerMessage(settings: Settings, token: string, body: string) {
  const conversation = await findConversationByToken(token);
  const delivery = await alertStaff(settings, { subject: conversation.subject, customer: { name: conversation.customer?.name ?? "", email: conversation.customer?.email ?? "", phone: conversation.customer?.phone ?? "" }, body, conversationId: conversation._id.toString() });
  const message = await MessageModel.create({ conversationId: conversation._id, sender: "customer", authorName: conversation.customer?.name ?? "Customer", body, delivery });
  conversation.status = "open";
  conversation.unreadByStaff = (conversation.unreadByStaff ?? 0) + 1;
  conversation.lastMessageAt = new Date();
  conversation.preview = preview(body);
  await conversation.save();
  return toMessage(message.toObject());
}

export async function addStaffReply(settings: Settings, staff: StaffSession, conversationId: string, body: string) {
  const conversation = await ConversationModel.findById(conversationId).select("+tokenSealed");
  if (!conversation) throw new HttpError(404, "This conversation could not be found.");
  const token = openToken(conversation.tokenSealed);
  const delivery = await deliverReply(settings, {
    name: conversation.customer?.name ?? "", email: conversation.customer?.email ?? "", phone: conversation.customer?.phone ?? "",
    subject: conversation.subject, body, author: staff.name, threadUrl: threadUrl(token),
  });
  const message = await MessageModel.create({ conversationId: conversation._id, sender: "staff", authorName: staff.name, authorId: staff.id, body, delivery });
  conversation.unreadByStaff = 0;
  conversation.lastMessageAt = new Date();
  conversation.preview = preview(body);
  await conversation.save();
  if (conversation.leadId) await LeadModel.updateOne({ _id: conversation.leadId, stage: "New" }, { stage: "Contacted" });
  return toMessage(message.toObject());
}
