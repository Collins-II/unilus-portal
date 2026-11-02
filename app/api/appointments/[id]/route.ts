import { AppointmentModel } from "@/lib/database/models";
import { appointmentInput, appointmentStatusInput } from "@/lib/domain";
import { requireStaff } from "@/lib/server/auth";
import { audit, toAppointment } from "@/lib/server/data";
import { handler, HttpError, readJson, requireObjectId } from "@/lib/server/http";
import { assertFutureSlot, assertVehicleExists } from "@/lib/server/rules";

type Context = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, { params }: Context) => {
  const staff = await requireStaff();
  const id = requireObjectId((await params).id, "appointment");
  const body = await readJson(request);
  const appointment = await AppointmentModel.findById(id);
  if (!appointment) throw new HttpError(404, "This appointment has been removed.");
  if (["Completed", "Cancelled"].includes(appointment.status)) throw new HttpError(409, "Completed or cancelled appointments cannot be changed.");

  if (body && typeof body === "object" && "status" in body && Object.keys(body).length === 1) {
    const { status } = appointmentStatusInput.parse(body);
    if (status === "Scheduled" && await AppointmentModel.exists({ _id: { $ne: id }, date: appointment.date, time: appointment.time, status: "Scheduled" })) {
      throw new HttpError(409, "This time slot is already booked. Edit the appointment to choose another time.");
    }
    appointment.status = status;
    await appointment.save();
    await audit(staff, "appointment.status", `Marked appointment for ${appointment.customer} as ${status.toLowerCase()}`, "appointment", id);
    return toAppointment(appointment.toObject());
  }

  const input = appointmentInput.parse(body);
  if (`${input.date}T${input.time}` !== `${appointment.date}T${appointment.time}`) assertFutureSlot(input.date, input.time);
  await assertVehicleExists(input.vehicleId);
  if (await AppointmentModel.exists({ _id: { $ne: id }, date: input.date, time: input.time, status: "Scheduled" })) throw new HttpError(409, "This time slot is already booked. Please choose another time.");
  appointment.set(input);
  await appointment.save();
  await audit(staff, "appointment.update", `Updated appointment for ${appointment.customer}`, "appointment", id);
  return toAppointment(appointment.toObject());
});
