import { VehicleModel } from "@/lib/database/models";
import { vehicleInput } from "@/lib/domain";
import { requireStaff } from "@/lib/server/auth";
import { audit, toVehicle, today, uniqueVehicleSlug } from "@/lib/server/data";
import { handler, readJson } from "@/lib/server/http";

export const POST = handler(async (request: Request) => {
  const staff = await requireStaff();
  const input = vehicleInput.parse(await readJson(request));
  const slug = await uniqueVehicleSlug(input.make, input.model, input.year);
  const vehicle = await VehicleModel.create({ ...input, slug, added: today() });
  await audit(staff, "vehicle.create", `Added ${input.year} ${input.make} ${input.model} (${vehicle.stock})`, "vehicle", vehicle._id.toString());
  return Response.json(toVehicle(vehicle.toObject()), { status: 201 });
});
