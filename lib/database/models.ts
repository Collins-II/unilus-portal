import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { APPOINTMENT_STATUSES, APPOINTMENT_TYPES, BODIES, CURRENCIES, FUELS, LEAD_SOURCES, LEAD_STAGES, PAYMENT_METHODS, ROLES, TRADE_IN_STATUSES, TRADE_IN_TYPES, TRANSMISSIONS, VEHICLE_CONDITIONS, VEHICLE_STATUSES } from "@/lib/domain";

function model<S extends Schema<any, any, any, any, any, any, any, any, any>>(name: string, schema: S): Model<InferSchemaType<S>> {
  return (mongoose.models[name] as Model<InferSchemaType<S>>) ?? mongoose.model<InferSchemaType<S>>(name, schema);
}

const staffSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ROLES, default: "staff" },
  active: { type: Boolean, default: true },
  lastLoginAt: Date,
  failedLogins: { type: Number, default: 0, select: false },
  lockedUntil: { type: Date, select: false },
}, { timestamps: true });

const vehicleSchema = new Schema({
  slug: { type: String, required: true, unique: true },
  make: { type: String, required: true, trim: true },
  model: { type: String, required: true, trim: true },
  year: { type: Number, required: true },
  price: { type: Number, required: true, min: 0 },
  mileage: { type: Number, required: true, min: 0 },
  fuel: { type: String, enum: FUELS, required: true },
  transmission: { type: String, enum: TRANSMISSIONS, required: true },
  body: { type: String, enum: BODIES, required: true },
  color: { type: String, default: "" },
  status: { type: String, enum: VEHICLE_STATUSES, default: "Available", index: true },
  stock: { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: { type: String, default: "" },
  badge: { type: String, default: "" },
  images: { type: [String], default: [] },
  featured: { type: Boolean, default: false },
  published: { type: Boolean, default: true, index: true },
  added: { type: String, required: true },
}, { timestamps: true });
vehicleSchema.index({ make: "text", model: "text", description: "text" });

const leadSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  phone: { type: String, default: "" },
  vehicleId: { type: String, default: "", index: true },
  stage: { type: String, enum: LEAD_STAGES, default: "New", index: true },
  source: { type: String, enum: LEAD_SOURCES, default: "Walk-in" },
  message: { type: String, default: "" },
  created: { type: String, required: true },
  conversationId: { type: String, default: "" },
}, { timestamps: true });

const appointmentSchema = new Schema({
  customer: { type: String, required: true, trim: true },
  email: { type: String, default: "" },
  phone: { type: String, default: "" },
  vehicleId: { type: String, default: "" },
  date: { type: String, required: true, index: true },
  time: { type: String, required: true },
  type: { type: String, enum: APPOINTMENT_TYPES, required: true },
  status: { type: String, enum: APPOINTMENT_STATUSES, default: "Scheduled" },
  notes: { type: String, default: "" },
  source: { type: String, enum: ["portal", "website"], default: "portal" },
}, { timestamps: true });

const saleSchema = new Schema({
  vehicleId: { type: String, required: true, unique: true },
  leadId: { type: String, required: true },
  customer: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  date: { type: String, required: true, index: true },
  payment: { type: String, enum: PAYMENT_METHODS, required: true },
  recordedBy: { type: String, default: "" },
}, { timestamps: true });

const settingsSchema = new Schema({
  key: { type: String, default: "default", unique: true },
  dealership: String,
  email: String,
  phone: String,
  whatsapp: String,
  address: String,
  currency: { type: String, enum: CURRENCIES },
  rates: { type: Map, of: Number, default: {} },
  ratesUpdatedAt: Date,
  notifyEmail: Boolean,
  notifySms: Boolean,
}, { timestamps: true });

const conversationSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  tokenSealed: { type: String, required: true, select: false },
  subject: { type: String, required: true },
  status: { type: String, enum: ["open", "closed"], default: "open", index: true },
  customer: { name: String, email: { type: String, lowercase: true }, phone: String },
  vehicleId: { type: String, default: "" },
  leadId: { type: String, default: "" },
  unreadByStaff: { type: Number, default: 0 },
  lastMessageAt: { type: Date, default: Date.now, index: true },
  preview: { type: String, default: "" },
}, { timestamps: true });

const messageSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
  sender: { type: String, enum: ["customer", "staff"], required: true },
  authorName: { type: String, required: true },
  authorId: { type: String, default: "" },
  body: { type: String, required: true, maxlength: 4000 },
  delivery: { email: String, sms: String },
}, { timestamps: true });

const tradeInSchema = new Schema({
  type: { type: String, enum: TRADE_IN_TYPES, required: true, index: true },
  status: { type: String, enum: TRADE_IN_STATUSES, default: "New", index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, default: "" },
  make: { type: String, required: true, trim: true },
  model: { type: String, required: true, trim: true },
  year: { type: Number, required: true },
  mileage: { type: Number, required: true, min: 0 },
  fuel: { type: String, enum: FUELS, required: true },
  transmission: { type: String, enum: TRANSMISSIONS, required: true },
  body: { type: String, enum: BODIES, required: true },
  color: { type: String, default: "" },
  condition: { type: String, enum: VEHICLE_CONDITIONS, required: true },
  askingPrice: { type: Number, default: 0, min: 0 },
  offer: { type: Number, default: 0, min: 0 },
  targetVehicleId: { type: String, default: "" },
  notes: { type: String, default: "" },
  staffNotes: { type: String, default: "" },
  images: { type: [String], default: [] },
  conversationId: { type: String, default: "" },
  leadId: { type: String, default: "" },
  vehicleId: { type: String, default: "" },
  created: { type: String, required: true },
}, { timestamps: true });
tradeInSchema.index({ createdAt: -1 });

const auditSchema = new Schema({
  actorId: String,
  actor: String,
  action: { type: String, required: true },
  entity: String,
  entityId: String,
  summary: String,
}, { timestamps: { createdAt: true, updatedAt: false } });
auditSchema.index({ createdAt: -1 });

export type StaffDoc = InferSchemaType<typeof staffSchema>;
export type VehicleDoc = InferSchemaType<typeof vehicleSchema>;
export type LeadDoc = InferSchemaType<typeof leadSchema>;
export type AppointmentDoc = InferSchemaType<typeof appointmentSchema>;
export type SaleDoc = InferSchemaType<typeof saleSchema>;
export type SettingsDoc = InferSchemaType<typeof settingsSchema>;
export type ConversationDoc = InferSchemaType<typeof conversationSchema>;
export type MessageDoc = InferSchemaType<typeof messageSchema>;

export const Staff = model("Staff", staffSchema);
export const VehicleModel = model("Vehicle", vehicleSchema);
export const LeadModel = model("Lead", leadSchema);
export const AppointmentModel = model("Appointment", appointmentSchema);
export const SaleModel = model("Sale", saleSchema);
export const SettingsModel = model("Settings", settingsSchema);
export const ConversationModel = model("Conversation", conversationSchema);
export const MessageModel = model("Message", messageSchema);
export const TradeInModel = model("TradeIn", tradeInSchema);
export const AuditModel = model("AuditLog", auditSchema);
