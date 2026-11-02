import { TradeInModel, VehicleModel } from "@/lib/database/models";
import { vehicleInput } from "@/lib/domain";
import { requireStaff } from "@/lib/server/auth";
import { audit, toTradeIn, toVehicle, today, uniqueVehicleSlug } from "@/lib/server/data";
import { handler, HttpError, requireObjectId } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

/** Turns an acquired trade-in into an unpublished inventory draft, carrying over its details and photos. */
export const POST = handler(async (_request: Request, { params }: Context) => {
  const staff = await requireStaff();
  const id = requireObjectId((await params).id, "trade-in");
  const tradeIn = await TradeInModel.findById(id);
  if (!tradeIn) throw new HttpError(404, "This request has been removed. Refresh the list.");
  if (tradeIn.vehicleId && (await VehicleModel.exists({ _id: tradeIn.vehicleId }))) throw new HttpError(409, "This car is already in your inventory.");
  if (!["Accepted", "Completed"].includes(tradeIn.status)) throw new HttpError(422, "Accept the offer before adding this car to your inventory.");
  const price = tradeIn.offer || tradeIn.askingPrice;
  if (!price) throw new HttpError(422, "Record an offer amount before adding this car to your inventory.");

  const input = vehicleInput.parse({
    make: tradeIn.make, model: tradeIn.model, year: tradeIn.year, price, mileage: tradeIn.mileage, fuel: tradeIn.fuel,
    transmission: tradeIn.transmission, body: tradeIn.body, color: tradeIn.color ?? "", stock: `TI-${id.slice(-6).toUpperCase()}`,
    description: tradeIn.notes ?? "", images: tradeIn.images, featured: false, published: false,
  });
  const slug = await uniqueVehicleSlug(input.make, input.model, input.year);
  const vehicle = await VehicleModel.create({ ...input, slug, added: today() });
  tradeIn.vehicleId = vehicle._id.toString();
  tradeIn.status = "Completed";
  await tradeIn.save();
  await audit(staff, "trade-in.inventory", `Added ${input.year} ${input.make} ${input.model} from ${tradeIn.name}'s ${tradeIn.type.toLowerCase()} request (${input.stock})`, "vehicle", vehicle._id.toString());
  return Response.json({ tradeIn: toTradeIn(tradeIn.toObject()), vehicle: toVehicle(vehicle.toObject()) }, { status: 201 });
});
