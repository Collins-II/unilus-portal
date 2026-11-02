import { TradeInModel } from "@/lib/database/models";
import { tradeInUpdateInput } from "@/lib/domain";
import { requireStaff } from "@/lib/server/auth";
import { audit, toTradeIn } from "@/lib/server/data";
import { handler, HttpError, readJson, requireObjectId } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, { params }: Context) => {
  const staff = await requireStaff();
  const id = requireObjectId((await params).id, "trade-in");
  const input = tradeInUpdateInput.parse(await readJson(request));
  const tradeIn = await TradeInModel.findById(id);
  if (!tradeIn) throw new HttpError(404, "This request has been removed. Refresh the list.");
  if (input.status === "Offer made" && !(input.offer ?? tradeIn.offer)) throw new HttpError(422, "offer: Enter the amount you're offering.");
  tradeIn.set(Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)));
  await tradeIn.save();
  const changes = [input.status && `status → ${input.status}`, input.offer !== undefined && `offer → ${input.offer}`, input.staffNotes !== undefined && "notes"].filter(Boolean).join(", ");
  await audit(staff, "trade-in.update", `Updated ${tradeIn.type.toLowerCase()} request from ${tradeIn.name}${changes ? ` (${changes})` : ""}`, "trade-in", id);
  return toTradeIn(tradeIn.toObject());
});

export const DELETE = handler(async (_request: Request, { params }: Context) => {
  const staff = await requireStaff("admin");
  const id = requireObjectId((await params).id, "trade-in");
  const tradeIn = await TradeInModel.findByIdAndDelete(id).lean();
  if (!tradeIn) throw new HttpError(404, "This request has already been removed.");
  await audit(staff, "trade-in.delete", `Deleted ${tradeIn.type.toLowerCase()} request from ${tradeIn.name}`, "trade-in", id);
  return { ok: true };
});
