import { AppointmentModel } from "@/lib/database/models";
import { appointmentInput } from "@/lib/domain";
import { requireStaff } from "@/lib/server/auth";
import { audit, toAppointment } from "@/lib/server/data";
import { handler, HttpError, readJson } from "@/lib/server/http";
import { assertFutureSlot, assertVehicleExists } from "@/lib/server/rules";

export const POST = handler(async (request: Request) => {
  const staff = await requireStaff();
  const input = appointmentInput.parse(await readJson(request));
  assertFutureSlot(input.date, input.time);
  await assertVehicleExists(input.vehicleId);
  if (await AppointmentModel.exists({ date: input.date, time: input.time, status: "Scheduled" })) throw new HttpError(409, "This time slot is already booked. Please choose another time.");
  const appointment = await AppointmentModel.create({ ...input, status: "Scheduled", source: "portal" });
  await audit(staff, "appointment.create", `Scheduled ${input.type.toLowerCase()} for ${input.customer} on ${input.date} ${input.time}`, "appointment", appointment._id.toString());
  return Response.json(toAppointment(appointment.toObject()), { status: 201 });
});
