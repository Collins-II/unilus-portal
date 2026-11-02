import { VehicleModel } from "@/lib/database/models";
import { requireStaff } from "@/lib/server/auth";
import { audit, today, uniqueVehicleSlug } from "@/lib/server/data";
import { handler, HttpError } from "@/lib/server/http";

const unsplash = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&q=85`;

// Starter collection so a fresh installation has something to show on the customer website.
const SAMPLE = [
  { make: "Porsche", model: "911 Carrera GTS", year: 2023, price: 1890000, mileage: 12400, fuel: "Petrol", transmission: "Automatic", body: "Coupe", color: "Chalk", badge: "JUST ARRIVED", featured: true, image: "photo-1503376780353-7e6692767b70", description: "A beautifully specified 911 Carrera GTS, bringing everyday usability and unmistakable Porsche character together in one focused, rewarding package." },
  { make: "Mercedes-Benz", model: "GLC 300", year: 2024, price: 1540000, mileage: 6800, fuel: "Hybrid", transmission: "Automatic", body: "SUV", color: "Obsidian Black", badge: "LOW MILEAGE", featured: true, image: "photo-1618843479313-40f8afb4b4d8", description: "An exceptionally composed luxury SUV with a refined cabin, intuitive technology and the reassuring presence Mercedes-Benz does so well." },
  { make: "BMW", model: "4 Series 430i", year: 2023, price: 1325000, mileage: 15600, fuel: "Petrol", transmission: "Automatic", body: "Coupe", color: "Brooklyn Grey", badge: "", featured: false, image: "photo-1555215695-3004980ad54e", description: "A modern grand tourer with athletic proportions, effortless performance and a finish that feels special every time you get behind the wheel." },
  { make: "Land Rover", model: "Range Rover Evoque", year: 2022, price: 1175000, mileage: 22100, fuel: "Diesel", transmission: "Automatic", body: "SUV", color: "Santorini Black", badge: "", featured: false, image: "photo-1606664515524-ed2f786a0bd6", description: "Distinctive design meets genuine all-terrain capability in this carefully selected Evoque, presented in an understated, timeless specification." },
  { make: "Audi", model: "A6 Avant", year: 2023, price: 1460000, mileage: 9800, fuel: "Diesel", transmission: "Automatic", body: "Wagon", color: "Glacier White", badge: "STAFF PICK", featured: true, image: "photo-1549317661-bd32c8ce0db2", description: "Elegant, capable and quietly accomplished, the A6 Avant is a premium long-distance companion with space for everything that matters." },
  { make: "Toyota", model: "Land Cruiser Prado", year: 2022, price: 1740000, mileage: 28600, fuel: "Diesel", transmission: "Automatic", body: "SUV", color: "Silver Metallic", badge: "", featured: false, image: "photo-1519641471654-76ce0107ad1b", description: "A trusted icon, ready for the open road. This Prado offers the comfort, durability and sure-footed confidence to go further." },
] as const;

export const POST = handler(async () => {
  const staff = await requireStaff("admin");
  if (await VehicleModel.exists({})) throw new HttpError(409, "Sample inventory can only be loaded into an empty inventory.");
  let n = 1;
  for (const { image, ...vehicle } of SAMPLE) {
    await VehicleModel.create({ ...vehicle, images: [unsplash(image)], stock: `MO-${String(n++).padStart(3, "0")}`, slug: await uniqueVehicleSlug(vehicle.make, vehicle.model, vehicle.year), status: "Available", published: true, added: today() });
  }
  await audit(staff, "vehicle.seed", `Loaded ${SAMPLE.length} sample vehicles`);
  return Response.json({ created: SAMPLE.length }, { status: 201 });
});
