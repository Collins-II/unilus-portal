import "server-only";
import { VehicleModel } from "@/lib/database/models";
import { HttpError } from "@/lib/server/http";

export async function assertVehicleForLead(vehicleId: string, previousVehicleId?: string) {
  if (!vehicleId) return;
  if (!/^[a-f\d]{24}$/i.test(vehicleId)) throw new HttpError(422, "Choose an existing vehicle.");
  const vehicle = await VehicleModel.findById(vehicleId).select("status").lean();
  if (!vehicle) throw new HttpError(422, "Choose an existing vehicle.");
  if (vehicle.status === "Sold" && vehicleId !== previousVehicleId) throw new HttpError(409, "This vehicle has already been sold. Please choose an available vehicle.");
}

export async function assertVehicleExists(vehicleId: string) {
  if (!vehicleId) return;
  if (!/^[a-f\d]{24}$/i.test(vehicleId) || !(await VehicleModel.exists({ _id: vehicleId }))) throw new HttpError(422, "Choose an existing vehicle.");
}

export function assertFutureSlot(date: string, time: string) {
  const now = new Date();
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${now.toTimeString().slice(0, 5)}`;
  if (`${date}T${time}` < local) throw new HttpError(422, "Please choose a future appointment time.");
}
