import { z } from "zod";
import { Booking } from "@/lib/campus/models";
import { bookingSchema } from "@/lib/campus/policy";
import { activeStudent, requireIntegration, roomTransaction, validateBooking } from "@/lib/campus/service";
import { handler, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const GET = handler(async (request: Request) => {
  requireIntegration(request);
  const studentId = z.string().trim().min(1).max(30).parse(new URL(request.url).searchParams.get("studentId"));
  const student = await activeStudent(studentId);
  return { bookings: await Booking.find({ user: student._id }).populate("room", "name code building").sort({ startTime: -1 }).lean() };
});
export const POST = handler(async (request: Request) => {
  requireIntegration(request);
  const { studentId, ...body } = z.object({ studentId: z.string().trim().min(1).max(30) }).passthrough().parse(await readJson(request));
  const input = bookingSchema.parse(body);
  const student = await activeStudent(studentId);
  const booking = await roomTransaction([input.roomId], async (session) => {
    await validateBooking(input, session);
    const [created] = await Booking.create([{
      ...input, user: student._id, room: input.roomId, conversation: input.conversationId || null,
      status: "pending", requestedAt: new Date(),
    }], { session });
    return created.populate("room", "name code building");
  });
  return { booking };
});
