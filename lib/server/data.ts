import "server-only";
import slugify from "slugify";
import type { Types } from "mongoose";
import { connectToDatabase } from "@/lib/database";
import { AuditModel, SettingsModel, VehicleModel } from "@/lib/database/models";
import { DEFAULT_SETTINGS, type Appointment, type Lead, type Message, type Sale, type Settings, type TradeIn, type Vehicle } from "@/lib/domain";
import type { StaffSession } from "@/lib/server/auth";

type WithId = { _id: Types.ObjectId | string };
const id = (doc: WithId) => doc._id.toString();

export function toVehicle(doc: WithId & Record<string, any>): Vehicle {
  return {
    id: id(doc), slug: doc.slug, make: doc.make, model: doc.model, year: doc.year, price: doc.price, mileage: doc.mileage,
    fuel: doc.fuel, transmission: doc.transmission, body: doc.body, color: doc.color ?? "", status: doc.status, stock: doc.stock,
    description: doc.description ?? "", badge: doc.badge ?? "", images: doc.images ?? [], featured: !!doc.featured,
    published: doc.published !== false, added: doc.added,
  };
}

export function toLead(doc: WithId & Record<string, any>): Lead {
  return {
    id: id(doc), name: doc.name, email: doc.email, phone: doc.phone ?? "", vehicleId: doc.vehicleId ?? "", stage: doc.stage,
    source: doc.source, message: doc.message ?? "", created: doc.created, conversationId: doc.conversationId || undefined,
  };
}

export function toAppointment(doc: WithId & Record<string, any>): Appointment {
  return {
    id: id(doc), customer: doc.customer, email: doc.email ?? "", phone: doc.phone ?? "", vehicleId: doc.vehicleId ?? "",
    date: doc.date, time: doc.time, type: doc.type, status: doc.status, notes: doc.notes ?? "", source: doc.source ?? "portal",
  };
}

export function toSale(doc: WithId & Record<string, any>): Sale {
  return { id: id(doc), vehicleId: doc.vehicleId, leadId: doc.leadId, customer: doc.customer, amount: doc.amount, date: doc.date, payment: doc.payment };
}

export function toMessage(doc: WithId & Record<string, any>): Message {
  return { id: id(doc), sender: doc.sender, authorName: doc.authorName, body: doc.body, createdAt: new Date(doc.createdAt).toISOString(), delivery: doc.delivery ?? undefined };
}

export function toTradeIn(doc: WithId & Record<string, any>): TradeIn {
  return {
    id: id(doc), type: doc.type, status: doc.status, name: doc.name, email: doc.email, phone: doc.phone ?? "",
    make: doc.make, model: doc.model, year: doc.year, mileage: doc.mileage, fuel: doc.fuel, transmission: doc.transmission, body: doc.body,
    color: doc.color ?? "", condition: doc.condition, askingPrice: doc.askingPrice ?? 0, offer: doc.offer ?? 0, targetVehicleId: doc.targetVehicleId ?? "",
    notes: doc.notes ?? "", staffNotes: doc.staffNotes ?? "", images: doc.images ?? [], conversationId: doc.conversationId ?? "",
    leadId: doc.leadId ?? "", vehicleId: doc.vehicleId ?? "", created: doc.created,
  };
}

/** Public-facing vehicle shape for the customer website (no internal fields). */
export function toPublicVehicle(doc: WithId & Record<string, any>) {
  const { id: vehicleId, slug, make, model, year, price, mileage, fuel, transmission, body, color, status, description, badge, images, featured } = toVehicle(doc);
  return { id: vehicleId, slug, make, model, year, price, mileage, fuel, transmission, body, color, status, description, badge, images, image: images[0] ?? "", featured };
}

export async function getSettings(): Promise<Settings> {
  await connectToDatabase();
  const doc = await SettingsModel.findOne({ key: "default" }).lean();
  if (!doc) return DEFAULT_SETTINGS;
  const rates = doc.rates instanceof Map ? Object.fromEntries(doc.rates) : (doc.rates as Record<string, number> | undefined) ?? {};
  return {
    dealership: !doc.dealership || /^idi\s+motors$/i.test(doc.dealership.trim()) ? DEFAULT_SETTINGS.dealership : doc.dealership,
    email: doc.email === "hello@idimotors.example" ? DEFAULT_SETTINGS.email : doc.email ?? DEFAULT_SETTINGS.email,
    phone: doc.phone ?? DEFAULT_SETTINGS.phone,
    whatsapp: doc.whatsapp ?? DEFAULT_SETTINGS.whatsapp,
    address: doc.address ?? DEFAULT_SETTINGS.address,
    currency: (doc.currency as Settings["currency"]) ?? DEFAULT_SETTINGS.currency,
    rates,
    notifyEmail: doc.notifyEmail ?? DEFAULT_SETTINGS.notifyEmail,
    notifySms: doc.notifySms ?? DEFAULT_SETTINGS.notifySms,
  };
}

export async function uniqueVehicleSlug(make: string, model: string, year: number, excludeId?: string) {
  const base = slugify(`${year} ${make} ${model}`, { lower: true, strict: true }) || "vehicle";
  let slug = base;
  for (let n = 2; await VehicleModel.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }); n += 1) slug = `${base}-${n}`;
  return slug;
}

export async function audit(actor: StaffSession | null, action: string, summary: string, entity?: string, entityId?: string) {
  try {
    await AuditModel.create({ actorId: actor?.id, actor: actor?.name ?? "Website", action, summary, entity, entityId });
  } catch (error) {
    console.error("[audit] failed to record entry", error);
  }
}

export function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
