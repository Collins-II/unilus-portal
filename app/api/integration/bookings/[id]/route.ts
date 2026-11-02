import { z } from "zod";
import { Booking } from "@/lib/campus/models";
import { bookingSchema, objectId } from "@/lib/campus/policy";
import { activeStudent, requireIntegration, roomTransaction, validateBooking } from "@/lib/campus/service";
import { handler, HttpError, readJson } from "@/lib/server/http";

export const PATCH = handler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  requireIntegration(request);
  const id = objectId.parse((await context.params).id);
  const { studentId, ...body } = z.object({ studentId: z.string().trim().min(1).max(30) }).passthrough().parse(await readJson(request));
  const student = await activeStudent(studentId);
  const current = await Booking.findOne({ _id: id, user: student._id });
  if (!current) throw new HttpError(404, "Booking not found.");
  const cancel = Object.keys(body).length === 0 || (body.status === "cancelled" && Object.keys(body).length === 1);
  const input = cancel ? null : bookingSchema.parse(body);
  const booking = await roomTransaction([String(current.room), ...(input ? [input.roomId] : [])], async (session) => {
    const booking = await Booking.findOne({ _id: id, user: student._id }).session(session);
    if (!booking) throw new HttpError(404, "Booking not found.");
    if (booking.status === "cancelled" && !cancel) throw new HttpError(409, "Cancelled bookings cannot be edited.");
    if (cancel) {
      booking.status = "cancelled";
      booking.cancellationReason = "student_cancelled";
    } else if (input) {
      if (booking.conversation && String(booking.conversation) !== input.conversationId) throw new HttpError(422, "The attached Study Circle cannot be changed.");
      await validateBooking(input, session, id);
      booking.set({ ...input, room: input.roomId, conversation: input.conversationId || null, status: "pending", requestedAt: new Date() });
    }
    await booking.save({ session });
    return booking.populate("room", "name code building");
  });
  return { booking };
});
