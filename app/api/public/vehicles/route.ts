import { connectToDatabase } from "@/lib/database";
import { VehicleModel } from "@/lib/database/models";
import { BODIES, FUELS } from "@/lib/domain";
import { toPublicVehicle } from "@/lib/server/data";
import { preflight, publicHandler } from "@/lib/server/http";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sorts: Record<string, Record<string, 1 | -1>> = {
  featured: { featured: -1, createdAt: -1 }, newest: { year: -1, createdAt: -1 }, "price-low": { price: 1 }, "price-high": { price: -1 }, recent: { createdAt: -1 },
};

export const GET = publicHandler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim().slice(0, 80) ?? "";
  const make = params.get("make")?.trim().slice(0, 60) ?? "";
  const body = params.get("body") ?? "";
  const fuel = params.get("fuel") ?? "";
  const minPrice = Number(params.get("minPrice")) || 0;
  const maxPrice = Number(params.get("maxPrice")) || 0;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 60, 1), 100);
  const page = Math.max(Number(params.get("page")) || 1, 1);

  const filter: Record<string, unknown> = { published: true, status: { $ne: "Sold" } };
  if (q) {
    const pattern = new RegExp(q.split(/\s+/).map(escapeRegex).join(".*"), "i");
    filter.$or = [{ make: pattern }, { model: pattern }, { body: pattern }, { color: pattern }, { stock: pattern }];
  }
  if (make) filter.make = new RegExp(`^${escapeRegex(make)}$`, "i");
  if ((BODIES as readonly string[]).includes(body)) filter.body = body;
  if ((FUELS as readonly string[]).includes(fuel)) filter.fuel = fuel;
  if (minPrice || maxPrice) filter.price = { ...(minPrice ? { $gte: minPrice } : {}), ...(maxPrice ? { $lte: maxPrice } : {}) };
  if (params.get("featured") === "1") filter.featured = true;

  await connectToDatabase();
  const [items, total, makes] = await Promise.all([
    VehicleModel.find(filter).sort(sorts[params.get("sort") ?? "featured"] ?? sorts.featured).skip((page - 1) * limit).limit(limit).lean(),
    VehicleModel.countDocuments(filter),
    VehicleModel.distinct("make", { published: true, status: { $ne: "Sold" } }),
  ]);
  return { vehicles: items.map(toPublicVehicle), total, page, pages: Math.max(1, Math.ceil(total / limit)), makes: makes.sort() };
}, { cacheSeconds: 30 });

export const OPTIONS = preflight;
