import { AppointmentModel, ConversationModel, LeadModel, SaleModel, TradeInModel, VehicleModel } from "@/lib/database/models";
import type { WorkspaceData } from "@/lib/domain";
import { requireStaff } from "@/lib/server/auth";
import { getSettings, toAppointment, toLead, toSale, toVehicle } from "@/lib/server/data";
import { handler } from "@/lib/server/http";

export const GET = handler(async (): Promise<WorkspaceData> => {
  const me = await requireStaff();
  const [vehicles, leads, appointments, sales, settings, unread, newTradeIns] = await Promise.all([
    VehicleModel.find().sort({ createdAt: -1 }).lean(),
    LeadModel.find().sort({ createdAt: -1 }).limit(2000).lean(),
    AppointmentModel.find().sort({ date: -1, time: -1 }).limit(2000).lean(),
    SaleModel.find().sort({ date: -1 }).limit(5000).lean(),
    getSettings(),
    ConversationModel.countDocuments({ unreadByStaff: { $gt: 0 } }),
    TradeInModel.countDocuments({ status: "New" }),
  ]);
  return {
    vehicles: vehicles.map(toVehicle), leads: leads.map(toLead), appointments: appointments.map(toAppointment), sales: sales.map(toSale),
    settings, unreadMessages: unread, newTradeIns, me,
  };
});
