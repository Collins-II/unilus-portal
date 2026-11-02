import { SaleModel, SettingsModel, VehicleModel } from "@/lib/database/models";
import { settingsInput } from "@/lib/domain";
import { requireStaff } from "@/lib/server/auth";
import { audit, getSettings } from "@/lib/server/data";
import { handler, HttpError, readJson } from "@/lib/server/http";
import { messagingStatus } from "@/lib/server/messaging";

export const GET = handler(async () => {
  await requireStaff();
  return { settings: await getSettings(), messaging: messagingStatus() };
});

export const PUT = handler(async (request: Request) => {
  const staff = await requireStaff("admin");
  const input = settingsInput.parse(await readJson(request));
  const current = await getSettings();
  if (input.currency !== current.currency && (await VehicleModel.exists({}) || await SaleModel.exists({}))) {
    throw new HttpError(409, `Prices and sales are stored in ${current.currency}. The base currency can't change once records exist; add display rates instead.`);
  }
  delete input.rates[input.currency];
  await SettingsModel.updateOne({ key: "default" }, { $set: { ...input, key: "default" } }, { upsert: true });
  await audit(staff, "settings.update", "Updated dealership settings");
  return { settings: await getSettings(), messaging: messagingStatus() };
});
