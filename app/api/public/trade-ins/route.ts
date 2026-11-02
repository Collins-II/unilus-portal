import { TradeInModel, VehicleModel } from "@/lib/database/models";
import { publicTradeInInput } from "@/lib/domain";
import { startConversation } from "@/lib/server/conversations";
import { audit, getSettings, today } from "@/lib/server/data";
import { clientIp, HttpError, preflight, publicHandler, rateLimit, readJson } from "@/lib/server/http";

const formatAmount = (amount: number, currency: string) => `${currency} ${Math.round(amount).toLocaleString("en-ZM")}`;

/** Website submissions from customers who want to sell their car to the dealership or swap it (plus a top-up) for one in stock. */
export const POST = publicHandler(async (request: Request) => {
  rateLimit(`trade-in:${clientIp(request)}`, 5, 10 * 60_000);
  const raw = await readJson(request);
  if (raw && typeof raw === "object" && "website" in raw && raw.website) return { ok: true };
  const input = publicTradeInInput.parse(raw);

  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (cloud && input.images.some((src) => !new URL(src).pathname.startsWith(`/${cloud}/`))) throw new HttpError(422, "images: Photos must be uploaded through the form");

  const settings = await getSettings();
  const target = input.type === "Swap" && input.targetVehicleSlug
    ? await VehicleModel.findOne({ slug: input.targetVehicleSlug, published: true, status: { $ne: "Sold" } }).lean()
    : null;
  if (input.type === "Swap" && input.targetVehicleSlug && !target) throw new HttpError(409, "The car you'd like to swap for is no longer available. Choose another or leave it blank.");

  const car = `${input.year} ${input.make} ${input.model}`;
  const targetName = target ? `${target.year} ${target.make} ${target.model}` : "";
  const topUp = target && input.askingPrice ? Math.max(0, target.price - input.askingPrice) : 0;
  const subject = input.type === "Sell" ? `Sell to us: ${car}` : `Swap & top-up: ${car}${targetName ? ` → ${targetName}` : ""}`;
  const lines = [
    input.type === "Sell" ? `I'd like to sell my ${car}.` : `I'd like to swap my ${car}${targetName ? ` for the ${targetName}` : ""} and top up the difference.`,
    `Mileage: ${input.mileage.toLocaleString("en-ZM")} km · ${input.fuel} · ${input.transmission} · ${input.body}${input.color ? ` · ${input.color}` : ""}`,
    `Condition: ${input.condition}`,
    input.askingPrice ? `${input.type === "Sell" ? "Asking price" : "Expected trade-in value"}: ${formatAmount(input.askingPrice, settings.currency)}` : "",
    topUp ? `Estimated top-up: ${formatAmount(topUp, settings.currency)}` : "",
    `Photos: ${input.images.length}`,
    input.notes ? `\n${input.notes}` : "",
  ].filter(Boolean);

  const tradeIn = await TradeInModel.create({
    type: input.type, name: input.name, email: input.email, phone: input.phone, make: input.make, model: input.model, year: input.year,
    mileage: input.mileage, fuel: input.fuel, transmission: input.transmission, body: input.body, color: input.color, condition: input.condition,
    askingPrice: input.askingPrice, targetVehicleId: target?._id.toString() ?? "", notes: input.notes, images: input.images, created: today(),
  });
  const result = await startConversation(settings, {
    name: input.name, email: input.email, phone: input.phone, subject, body: lines.join("\n"), vehicleId: target?._id.toString() ?? "",
  });
  tradeIn.conversationId = result.conversationId;
  tradeIn.leadId = result.leadId;
  await tradeIn.save();
  await audit(null, "trade-in.create", `${input.name} submitted "${subject}"`, "trade-in", tradeIn._id.toString());
  return { ok: true, id: tradeIn._id.toString(), token: result.token, threadUrl: result.threadUrl };
});

export const OPTIONS = preflight;
