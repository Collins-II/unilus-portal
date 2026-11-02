import "server-only";
import { Resend } from "resend";
import twilio from "twilio";
import type { Settings } from "@/lib/domain";

export type DeliveryStatus = "sent" | "skipped" | "failed";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const portalUrl = () => (process.env.NEXTAUTH_URL ?? "http://localhost:3001").replace(/\/$/, "");

let resend: Resend | null | undefined;
function emailClient() {
  if (resend === undefined) resend = process.env.RESEND_API_KEY && process.env.FROM_EMAIL ? new Resend(process.env.RESEND_API_KEY) : null;
  return resend;
}

let sms: ReturnType<typeof twilio> | null | undefined;
function smsClient() {
  if (sms === undefined) {
    const sid = process.env.TWILIO_ACCOUNT_SID ?? "";
    const token = process.env.TWILIO_AUTH_TOKEN ?? "";
    // Placeholder values such as "ACxxxx" are treated as "not configured".
    sms = /^AC[a-f0-9]{32}$/i.test(sid) && token.length >= 32 ? twilio(sid, token) : null;
  }
  return sms;
}

export const messagingStatus = () => ({ email: !!emailClient(), sms: !!smsClient() && !!process.env.TWILIO_SMS_FROM, whatsapp: !!smsClient() && !!process.env.TWILIO_WHATSAPP_FROM });

function layout(dealership: string, heading: string, body: string, action?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f6f7f2;font-family:Arial,sans-serif;color:#2c3327">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7c8770;margin:0 0 16px">${escapeHtml(dealership)}</p>
    <div style="background:#fff;border:1px solid #e3e7dc;border-radius:14px;padding:28px">
      <h1 style="font-size:20px;margin:0 0 16px;font-weight:600">${escapeHtml(heading)}</h1>
      <div style="font-size:14px;line-height:1.7;color:#4b5443">${body}</div>
      ${action ? `<p style="margin:24px 0 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#365640;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:13px;font-weight:600">${escapeHtml(action.label)}</a></p>` : ""}
    </div>
  </div></body></html>`;
}

const paragraphs = (text: string) => escapeHtml(text).split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>")}</p>`).join("");

async function sendEmail(to: string, subject: string, html: string, replyTo?: string): Promise<DeliveryStatus> {
  const client = emailClient();
  if (!client || !to) return "skipped";
  try {
    const { error } = await client.emails.send({ from: process.env.FROM_EMAIL!, to: [to], subject, html, ...(replyTo ? { replyTo } : {}) });
    if (error) throw new Error(error.message);
    return "sent";
  } catch (error) {
    console.error("[email] delivery failed", error);
    return "failed";
  }
}

async function sendSms(to: string, body: string): Promise<DeliveryStatus> {
  const client = smsClient();
  const normalized = to.replace(/[\s()-]/g, "");
  if (!client || !process.env.TWILIO_SMS_FROM || !/^\+\d{8,15}$/.test(normalized)) return "skipped";
  try {
    await client.messages.create({ from: process.env.TWILIO_SMS_FROM, to: normalized, body: body.slice(0, 600) });
    if (process.env.TWILIO_WHATSAPP_FROM) {
      await client.messages.create({ from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`, to: `whatsapp:${normalized}`, body: body.slice(0, 1500) }).catch((error) => console.error("[whatsapp] delivery failed", error));
    }
    return "sent";
  } catch (error) {
    console.error("[sms] delivery failed", error);
    return "failed";
  }
}

/** Alerts the dealership team about a new enquiry or customer message. */
export async function alertStaff(settings: Settings, input: { subject: string; customer: { name: string; email: string; phone: string }; body: string; conversationId: string }) {
  const link = `${portalUrl()}/messages?c=${input.conversationId}`;
  const to = process.env.NOTIFY_EMAIL || settings.email;
  const details = `<p style="margin:0 0 12px"><strong>${escapeHtml(input.customer.name)}</strong> &lt;${escapeHtml(input.customer.email)}&gt;${input.customer.phone ? ` · ${escapeHtml(input.customer.phone)}` : ""}</p>${paragraphs(input.body)}`;
  const [email, text] = await Promise.all([
    settings.notifyEmail ? sendEmail(to, `New message: ${input.subject}`, layout(settings.dealership, input.subject, details, { label: "Open in portal", url: link }), input.customer.email) : Promise.resolve<DeliveryStatus>("skipped"),
    settings.notifySms && process.env.ADMIN_PHONE ? sendSms(process.env.ADMIN_PHONE, `${settings.dealership}: new message from ${input.customer.name} - ${input.subject}. ${link}`) : Promise.resolve<DeliveryStatus>("skipped"),
  ]);
  return { email, sms: text };
}

/** Confirms receipt to the customer and gives them a private link to follow the conversation. */
export async function confirmToCustomer(settings: Settings, input: { name: string; email: string; subject: string; body: string; threadUrl: string }) {
  const html = layout(settings.dealership, `Thanks, ${input.name.split(" ")[0]}. We've received your message.`,
    `<p style="margin:0 0 12px">Our team will reply shortly. You can follow and continue the conversation at any time using the button below.</p><p style="margin:0 0 6px;color:#7c8770;font-size:12px">Your message</p>${paragraphs(input.body)}`,
    { label: "View conversation", url: input.threadUrl });
  return sendEmail(input.email, `${settings.dealership}: ${input.subject}`, html, process.env.NOTIFY_EMAIL || settings.email);
}

/** Delivers a staff reply to the customer by email and (when enabled) SMS/WhatsApp. */
export async function deliverReply(settings: Settings, input: { name: string; email: string; phone: string; subject: string; body: string; author: string; threadUrl: string }) {
  const html = layout(settings.dealership, `Re: ${input.subject}`, `<p style="margin:0 0 12px">Hi ${escapeHtml(input.name.split(" ")[0])},</p>${paragraphs(input.body)}<p style="margin:16px 0 0;color:#7c8770">${escapeHtml(input.author)}<br>${escapeHtml(settings.dealership)}</p>`, { label: "Reply to this message", url: input.threadUrl });
  const [email, text] = await Promise.all([
    sendEmail(input.email, `Re: ${input.subject}`, html, process.env.NOTIFY_EMAIL || settings.email),
    settings.notifySms && input.phone ? sendSms(input.phone, `${settings.dealership}: you have a new reply about "${input.subject}". Read it here: ${input.threadUrl}`) : Promise.resolve<DeliveryStatus>("skipped"),
  ]);
  return { email, sms: text };
}
