import { VehicleModel } from "@/lib/database/models";
import { publicEnquiryInput } from "@/lib/domain";
import { startConversation } from "@/lib/server/conversations";
import { audit, getSettings } from "@/lib/server/data";
import { clientIp, preflight, publicHandler, rateLimit, readJson } from "@/lib/server/http";

export const POST = publicHandler(async (request: Request) => {
  rateLimit(`enquiry:${clientIp(request)}`, 5, 10 * 60_000);
  const raw = await readJson(request);
  // Bots that fill the hidden honeypot field get a normal-looking response but nothing is stored.
  if (raw && typeof raw === "object" && "website" in raw && raw.website) return { ok: true };
  const input = publicEnquiryInput.parse(raw);
  const settings = await getSettings();
  const vehicle = input.vehicleSlug ? await VehicleModel.findOne({ slug: input.vehicleSlug, published: true }).lean() : null;
  const subject = vehicle ? `Enquiry: ${vehicle.year} ${vehicle.make} ${vehicle.model}` : "General enquiry";
  const result = await startConversation(settings, { name: input.name, email: input.email, phone: input.phone, subject, body: input.message, vehicleId: vehicle?._id.toString() ?? "" });
  await audit(null, "enquiry.create", `${input.name} sent "${subject}"`, "conversation", result.conversationId);
  return { ok: true, threadUrl: result.threadUrl, token: result.token, emailConfirmation: result.confirmation };
});

export const OPTIONS = preflight;
