import { getSettings } from "@/lib/server/data";
import { preflight, publicHandler } from "@/lib/server/http";

export const GET = publicHandler(async () => {
  const { dealership, email, phone, whatsapp, address, currency, rates } = await getSettings();
  return { dealership, email, phone, whatsapp, address, currency, rates };
}, { cacheSeconds: 60 });

export const OPTIONS = preflight;
