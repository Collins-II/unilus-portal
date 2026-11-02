import { TradeInModel } from "@/lib/database/models";
import { requireStaff } from "@/lib/server/auth";
import { toTradeIn } from "@/lib/server/data";
import { handler } from "@/lib/server/http";

export const GET = handler(async () => {
  await requireStaff();
  const tradeIns = await TradeInModel.find().sort({ createdAt: -1 }).limit(1000).lean();
  return tradeIns.map(toTradeIn);
});