import { z } from "zod";

export const FUELS = ["Petrol", "Diesel", "Electric", "Hybrid"] as const;
export const TRANSMISSIONS = ["Automatic", "Manual"] as const;
export const BODIES = ["SUV", "Sedan", "Coupe", "Wagon", "Hatchback", "Truck", "Convertible"] as const;
export const VEHICLE_STATUSES = ["Available", "Reserved", "Sold"] as const;
export const LEAD_STAGES = ["New", "Contacted", "Test drive", "Negotiation", "Won", "Lost"] as const;
export const LEAD_SOURCES = ["Website", "Walk-in", "Referral", "Social media", "Phone"] as const;
export const APPOINTMENT_TYPES = ["Test drive", "Vehicle delivery", "Consultation", "Viewing"] as const;
export const APPOINTMENT_STATUSES = ["Requested", "Scheduled", "Completed", "Cancelled"] as const;
export const PAYMENT_METHODS = ["Cash", "Finance", "Bank transfer", "Mobile money"] as const;
export const ROLES = ["admin", "staff"] as const;
export const CURRENCIES = ["ZMW", "USD", "EUR", "GBP", "ZAR"] as const;
export const TRADE_IN_TYPES = ["Sell", "Swap"] as const;
export const TRADE_IN_STATUSES = ["New", "Reviewing", "Offer made", "Accepted", "Declined", "Completed"] as const;
export const VEHICLE_CONDITIONS = ["Excellent", "Good", "Fair", "Needs work"] as const;
export const MAX_VEHICLE_IMAGES = 12;

export type Currency = (typeof CURRENCIES)[number];
export type Role = (typeof ROLES)[number];

const trimmed = (min = 1, max = 200) => z.string().trim().min(min).max(max);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use the HH:MM format");
const phone = z.string().trim().max(30).regex(/^[+\d\s()-]*$/, "Enter a valid phone number");
const email = z.string().trim().toLowerCase().max(200).pipe(z.email("Enter a valid email address"));
const imageUrl = z.string().trim().refine((value) => value.startsWith("/") || /^https:\/\//.test(value), "Images must be HTTPS URLs");

export const vehicleInput = z.object({
  make: trimmed(1, 60),
  model: trimmed(1, 80),
  year: z.coerce.number().int().min(1950).max(new Date().getFullYear() + 2),
  price: z.coerce.number().positive().max(1_000_000_000),
  mileage: z.coerce.number().int().nonnegative().max(2_000_000),
  fuel: z.enum(FUELS),
  transmission: z.enum(TRANSMISSIONS),
  body: z.enum(BODIES),
  color: z.string().trim().max(40).default(""),
  status: z.enum(["Available", "Reserved"]).default("Available"),
  stock: trimmed(1, 30),
  description: z.string().trim().max(3000).default(""),
  badge: z.string().trim().max(30).default(""),
  images: z.array(imageUrl).max(MAX_VEHICLE_IMAGES).default([]),
  featured: z.boolean().default(false),
  published: z.boolean().default(true),
});

export const leadInput = z.object({
  name: trimmed(2, 100),
  email: email,
  phone: phone.default(""),
  vehicleId: z.string().trim().max(40).default(""),
  source: z.enum(LEAD_SOURCES).default("Walk-in"),
  message: z.string().trim().max(3000).default(""),
});
export const leadStageInput = z.object({ stage: z.enum(LEAD_STAGES) });

export const appointmentInput = z.object({
  customer: trimmed(2, 100),
  email: z.union([z.literal(""), email]).default(""),
  phone: phone.default(""),
  vehicleId: z.string().trim().max(40).default(""),
  date: isoDate,
  time,
  type: z.enum(APPOINTMENT_TYPES),
  notes: z.string().trim().max(1000).default(""),
});
export const appointmentStatusInput = z.object({ status: z.enum(APPOINTMENT_STATUSES) });

export const saleInput = z.object({
  vehicleId: trimmed(1, 40),
  leadId: trimmed(1, 40),
  amount: z.coerce.number().positive().max(1_000_000_000),
  date: isoDate,
  payment: z.enum(PAYMENT_METHODS),
});

export const settingsInput = z.object({
  dealership: trimmed(2, 100),
  email: email,
  phone: phone,
  whatsapp: phone.default(""),
  address: z.string().trim().max(300).default(""),
  currency: z.enum(CURRENCIES),
  rates: z.record(z.string(), z.coerce.number().positive()).default({}),
  notifyEmail: z.boolean().default(true),
  notifySms: z.boolean().default(false),
});

export const staffInput = z.object({
  name: trimmed(2, 100),
  email: email,
  role: z.enum(ROLES),
  password: z.string().min(10, "Passwords need at least 10 characters").max(200),
});
export const staffUpdateInput = z.object({
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  name: trimmed(2, 100).optional(),
  password: z.string().min(10, "Passwords need at least 10 characters").max(200).optional(),
});
export const passwordChangeInput = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(10, "Passwords need at least 10 characters").max(200),
});

export const messageInput = z.object({ body: trimmed(1, 4000) });
export const conversationStatusInput = z.object({ status: z.enum(["open", "closed"]) });

// Public (customer-facing) inputs. `website` is a honeypot that real users never fill in.
export const publicEnquiryInput = z.object({
  name: trimmed(2, 100),
  email: email,
  phone: phone.default(""),
  message: trimmed(2, 3000),
  vehicleSlug: z.string().trim().max(120).default(""),
  website: z.string().max(0).optional(),
});
export const publicAppointmentInput = z.object({
  name: trimmed(2, 100),
  email: email,
  phone: phone.default(""),
  vehicleSlug: z.string().trim().max(120).default(""),
  date: isoDate,
  time,
  type: z.enum(["Test drive", "Viewing", "Consultation"]).default("Test drive"),
  notes: z.string().trim().max(1000).default(""),
  website: z.string().max(0).optional(),
});

/** Photos submitted by the public must have been uploaded through our own Cloudinary account. */
const uploadedImage = z.string().trim().max(500).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}, "Photos must be uploaded through the form");

export const publicTradeInInput = z.object({
  type: z.enum(TRADE_IN_TYPES),
  name: trimmed(2, 100),
  email: email,
  phone: trimmed(6, 30).regex(/^[+\d\s()-]*$/, "Enter a valid phone number"),
  make: trimmed(1, 60),
  model: trimmed(1, 80),
  year: z.coerce.number().int().min(1950).max(new Date().getFullYear() + 1),
  mileage: z.coerce.number().int().nonnegative().max(2_000_000),
  fuel: z.enum(FUELS),
  transmission: z.enum(TRANSMISSIONS),
  body: z.enum(BODIES),
  color: z.string().trim().max(40).default(""),
  condition: z.enum(VEHICLE_CONDITIONS),
  askingPrice: z.coerce.number().nonnegative().max(1_000_000_000).default(0),
  targetVehicleSlug: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(2000).default(""),
  images: z.array(uploadedImage).min(1, "Add at least one photo of your car").max(MAX_VEHICLE_IMAGES),
  website: z.string().max(0).optional(),
});

export const tradeInUpdateInput = z.object({
  status: z.enum(TRADE_IN_STATUSES).optional(),
  offer: z.coerce.number().nonnegative().max(1_000_000_000).optional(),
  staffNotes: z.string().trim().max(3000).optional(),
});

export type TradeIn = {
  id: string; type: (typeof TRADE_IN_TYPES)[number]; status: (typeof TRADE_IN_STATUSES)[number];
  name: string; email: string; phone: string;
  make: string; model: string; year: number; mileage: number; fuel: string; transmission: string; body: string; color: string;
  condition: string; askingPrice: number; offer: number; targetVehicleId: string; notes: string; staffNotes: string; images: string[];
  conversationId: string; leadId: string; vehicleId: string; created: string;
};

export type Vehicle = Omit<z.infer<typeof vehicleInput>, "status"> & { id: string; slug: string; status: (typeof VEHICLE_STATUSES)[number]; added: string };
export type Lead = z.infer<typeof leadInput> & { id: string; stage: (typeof LEAD_STAGES)[number]; created: string; conversationId?: string };
export type Appointment = z.infer<typeof appointmentInput> & { id: string; status: (typeof APPOINTMENT_STATUSES)[number]; source: "portal" | "website" };
export type Sale = z.infer<typeof saleInput> & { id: string; customer: string };
export type Settings = z.infer<typeof settingsInput>;
export type StaffMember = { id: string; name: string; email: string; role: Role; active: boolean; lastLoginAt?: string };
export type ConversationSummary = {
  id: string; subject: string; status: "open" | "closed"; customer: { name: string; email: string; phone: string };
  vehicleId: string; leadId: string; unread: number; lastMessageAt: string; preview: string;
};
export type Message = { id: string; sender: "customer" | "staff"; authorName: string; body: string; createdAt: string; delivery?: { email?: string; sms?: string } };
export type AuditEntry = { id: string; actor: string; action: string; summary: string; createdAt: string };
export type WorkspaceData = {
  vehicles: Vehicle[]; leads: Lead[]; appointments: Appointment[]; sales: Sale[]; settings: Settings;
  unreadMessages: number;
  newTradeIns: number;
  me: { id: string; name: string; email: string; role: Role };
};

export const DEFAULT_SETTINGS: Settings = {
  dealership: "Linkdrive Auto Hub",
  email: "",
  phone: "+260 779 691 111",
  whatsapp: "+260779691111",
  address: "Lusaka, Zambia",
  currency: "ZMW",
  rates: { USD: 0.037, EUR: 0.034, GBP: 0.029, ZAR: 0.68 },
  notifyEmail: true,
  notifySms: false,
};

export function vehicleTitle(vehicle: Pick<Vehicle, "make" | "model">) {
  return `${vehicle.make} ${vehicle.model}`;
}

export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Converts an amount in the settings base currency to `target`, using rates expressed as "1 base = rate target". */
export function convert(amount: number, settings: Pick<Settings, "currency" | "rates">, target: string) {
  if (target === settings.currency) return amount;
  const rate = settings.rates[target];
  return rate ? amount * rate : null;
}

export function formatMoney(value: number, currency: string, locale = "en", compact = false) {
  return new Intl.NumberFormat(locale, {
    style: "currency", currency, maximumFractionDigits: compact ? 1 : 0,
    ...(compact ? { notation: "compact" as const } : {}),
  }).format(value);
}

export function initials(name: string) {
  return name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}
