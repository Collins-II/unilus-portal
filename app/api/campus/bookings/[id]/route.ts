import { z } from "zod";
import { Booking, Student } from "@/lib/campus/models";
import { objectId } from "@/lib/campus/policy";
import { roomTransaction, validateBooking } from "@/lib/campus/service";
import { requireStaff } from "@/lib/server/auth";
import { handler, HttpError, readJson } from "@/lib/server/http";

export const PATCH = handler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireStaff();
  const id = objectId.parse((await context.params).id);
  const { status } = z.object({ status: z.enum(["confirmed", "cancelled"]) }).strict().parse(await readJson(request));
  const current = await Booking.findById(id);
  if (!current) throw new HttpError(404, "Booking not found.");
  return roomTransaction([String(current.room)], async (session) => {
    const booking = await Booking.findById(id).session(session);
    if (!booking) throw new HttpError(404, "Booking not found.");
    if (booking.status === "cancelled") throw new HttpError(409, "A cancelled booking cannot be approved or changed.");
    if (status === "confirmed") {
      if (!await Student.exists({ _id: booking.user, role: "student", status: "active" }).session(session)) throw new HttpError(409, "Only active student accounts can have bookings approved.");
      await validateBooking({
        roomId: String(booking.room), purpose: booking.purpose as "Event" | "Tutorial Group",
        title: booking.title || "", attendees: booking.attendees, startTime: booking.startTime, endTime: booking.endTime,
      }, session, id, true);
    }
    booking.status = status;
    if (status === "cancelled") booking.cancellationReason = "staff_cancelled";
    await booking.save({ session });
    return { booking: await booking.populate("room", "name code building") };
  });
});
