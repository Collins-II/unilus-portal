import { LeadModel, SaleModel, VehicleModel } from "@/lib/database/models";
import { saleInput } from "@/lib/domain";
import { requireStaff } from "@/lib/server/auth";
import { audit, toSale, today } from "@/lib/server/data";
import { handler, HttpError, readJson } from "@/lib/server/http";

export const POST = handler(async (request: Request) => {
  const staff = await requireStaff();
  const input = saleInput.parse(await readJson(request));
  if (input.date > today()) throw new HttpError(422, "A completed sale cannot have a future date.");
  if (![input.vehicleId, input.leadId].every((id) => /^[a-f\d]{24}$/i.test(id))) throw new HttpError(422, "Choose a vehicle and customer.");
  const lead = await LeadModel.findById(input.leadId);
  if (!lead) throw new HttpError(422, "Choose a customer. Add them as a lead first if needed.");

  // Claim the vehicle atomically so concurrent sales of the same car cannot both succeed.
  const vehicle = await VehicleModel.findOneAndUpdate({ _id: input.vehicleId, status: { $ne: "Sold" } }, { status: "Sold" }, { new: false });
  if (!vehicle) throw new HttpError(409, "This vehicle is no longer available.");

  try {
    const sale = await SaleModel.create({ ...input, customer: lead.name, recordedBy: staff.name });
    if (lead.vehicleId === input.vehicleId || !lead.vehicleId) {
      lead.set({ stage: "Won", vehicleId: input.vehicleId });
      await lead.save();
    } else {
      await LeadModel.create({ name: lead.name, email: lead.email, phone: lead.phone, vehicleId: input.vehicleId, stage: "Won", source: lead.source, created: today() });
    }
    await LeadModel.updateMany({ vehicleId: input.vehicleId, stage: { $nin: ["Won", "Lost"] } }, { stage: "Lost" });
    await audit(staff, "sale.create", `Sold ${vehicle.year} ${vehicle.make} ${vehicle.model} to ${lead.name}`, "sale", sale._id.toString());
    return Response.json(toSale(sale.toObject()), { status: 201 });
  } catch (error) {
    await VehicleModel.updateOne({ _id: input.vehicleId }, { status: vehicle.status });
    throw error;
  }
});
