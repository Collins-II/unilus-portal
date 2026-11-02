import { AppointmentModel, VehicleModel } from "@/lib/database/models";
import { publicAppointmentInput } from "@/lib/domain";
import { startConversation } from "@/lib/server/conversations";
import { audit, getSettings } from "@/lib/server/data";
import { clientIp, HttpError, preflight, publicHandler, rateLimit, readJson } from "@/lib/server/http";
import { assertFutureSlot } from "@/lib/server/rules";

export const POST = publicHandler(async (request: Request) => {
  rateLimit(`booking:${clientIp(request)}`, 5, 10 * 60_000);
  const raw = await readJson(request);
  if (raw && typeof raw === "object" && "website" in raw && raw.website) return { ok: true };
  const input = publicAppointmentInput.parse(raw);
  assertFutureSlot(input.date, input.time);
  const settings = await getSettings();
  const vehicle = input.vehicleSlug ? await VehicleModel.findOne({ slug: input.vehicleSlug, published: true, status: { $ne: "Sold" } }).lean() : null;
  if (input.vehicleSlug && !vehicle) throw new HttpError(409, "This vehicle is no longer available. Please contact us about similar cars.");
  if (await AppointmentModel.exists({ date: input.date, time: input.time, status: "Scheduled" })) throw new HttpError(409, "That time is already booked. Please choose another time.");

  const vehicleName = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "";
  const appointment = await AppointmentModel.create({
    customer: input.name, email: input.email, phone: input.phone, vehicleId: vehicle?._id.toString() ?? "", date: input.date, time: input.time,
    type: input.type, notes: input.notes, status: "Requested", source: "website",
  });
  const body = `${input.type} requested for ${input.date} at ${input.time}${vehicleName ? ` (${vehicleName})` : ""}.${input.notes ? `\n\n${input.notes}` : ""}`;
  const result = await startConversation(settings, { name: input.name, email: input.email, phone: input.phone, subject: `${input.type} request${vehicleName ? `: ${vehicleName}` : ""}`, body, vehicleId: vehicle?._id.toString() ?? "" });
  await audit(null, "appointment.request", `${input.name} requested a ${input.type.toLowerCase()} on ${input.date} ${input.time}`, "appointment", appointment._id.toString());
  return { ok: true, status: "Requested", threadUrl: result.threadUrl, token: result.token };
});

export const OPTIONS = preflight;
