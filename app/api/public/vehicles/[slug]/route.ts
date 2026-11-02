import { connectToDatabase } from "@/lib/database";
import { VehicleModel } from "@/lib/database/models";
import { toPublicVehicle } from "@/lib/server/data";
import { HttpError, preflight, publicHandler } from "@/lib/server/http";

export const GET = publicHandler(async (_request: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,140}$/.test(slug)) throw new HttpError(404, "Vehicle not found.");
  await connectToDatabase();
  const vehicle = await VehicleModel.findOne({ slug, published: true }).lean();
  if (!vehicle) throw new HttpError(404, "Vehicle not found.");
  const related = await VehicleModel.find({ _id: { $ne: vehicle._id }, published: true, status: { $ne: "Sold" } })
    .sort({ featured: -1, createdAt: -1 }).limit(12).lean();
  const ranked = [...related.filter((v) => v.body === vehicle.body), ...related.filter((v) => v.body !== vehicle.body)].slice(0, 3);
  return { vehicle: toPublicVehicle(vehicle), related: ranked.map(toPublicVehicle) };
}, { cacheSeconds: 30 });

export const OPTIONS = preflight;
