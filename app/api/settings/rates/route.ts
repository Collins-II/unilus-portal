import { SettingsModel } from "@/lib/database/models";
import { CURRENCIES } from "@/lib/domain";
import { requireStaff } from "@/lib/server/auth";
import { audit, getSettings } from "@/lib/server/data";
import { handler, HttpError } from "@/lib/server/http";

/** Refreshes exchange rates for the supported display currencies from a public rates API. */
export const POST = handler(async () => {
  const staff = await requireStaff("admin");
  const settings = await getSettings();
  const source = process.env.EXCHANGE_RATES_URL ?? "https://open.er-api.com/v6/latest";
  const response = await fetch(`${source}/${settings.currency}`, { cache: "no-store", signal: AbortSignal.timeout(8000) }).catch(() => null);
  const body = response?.ok ? await response.json().catch(() => null) : null;
  const all = body?.rates as Record<string, number> | undefined;
  if (!all) throw new HttpError(502, "Exchange rates could not be fetched right now. You can still enter rates manually.");
  const rates = Object.fromEntries(CURRENCIES.filter((code) => code !== settings.currency && typeof all[code] === "number").map((code) => [code, all[code]]));
  await SettingsModel.updateOne({ key: "default" }, { $set: { ...settings, rates, ratesUpdatedAt: new Date(), key: "default" } }, { upsert: true });
  await audit(staff, "settings.rates", `Refreshed exchange rates for ${settings.currency}`);
  return { rates };
});
