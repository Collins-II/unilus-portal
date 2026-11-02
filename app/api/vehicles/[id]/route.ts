import { AppointmentModel, LeadModel, SaleModel, VehicleModel } from "@/lib/database/models";
import { vehicleInput } from "@/lib/domain";
import { requireStaff } from "@/lib/server/auth";
import { audit, toVehicle, uniqueVehicleSlug } from "@/lib/server/data";
import { handler, HttpError, readJson, requireObjectId } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, { params }: Context) => {
  const staff = await requireStaff();
  const id = requireObjectId((await params).id, "vehicle");
  const input = vehicleInput.parse(await readJson(request));
  const current = await VehicleModel.findById(id);
  if (!current) throw new HttpError(404, "This vehicle has been removed. Refresh your inventory.");
  const renamed = current.make !== input.make || current.model !== input.model || current.year !== input.year;
  current.set({ ...input, status: current.status === "Sold" ? "Sold" : input.status });
  if (renamed) current.slug = await uniqueVehicleSlug(input.make, input.model, input.year, id);
  await current.save();
  await audit(staff, "vehicle.update", `Updated ${input.year} ${input.make} ${input.model} (${current.stock})`, "vehicle", id);
  return toVehicle(current.toObject());
});

export const DELETE = handler(async (_request: Request, { params }: Context) => {
  const staff = await requireStaff();
  const id = requireObjectId((await params).id, "vehicle");
  const [leads, appointments, sales] = await Promise.all([LeadModel.exists({ vehicleId: id }), AppointmentModel.exists({ vehicleId: id }), SaleModel.exists({ vehicleId: id })]);
  if (leads || appointments || sales) throw new HttpError(409, "This vehicle has linked leads, appointments or sales. Unpublish it instead to preserve your history.");
  const vehicle = await VehicleModel.findByIdAndDelete(id);
  if (!vehicle) throw new HttpError(404, "This vehicle has already been removed.");
  await audit(staff, "vehicle.delete", `Deleted ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.stock})`, "vehicle", id);
  return { ok: true };
});
