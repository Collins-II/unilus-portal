import { clientIp, preflight, publicHandler, rateLimit } from "@/lib/server/http";
import { uploadFolders, uploadImageFromRequest } from "@/lib/server/uploads";

/** Lets website visitors attach photos of a car they want to sell or swap. */
export const POST = publicHandler(async (request: Request) => {
  rateLimit(`public-upload:${clientIp(request)}`, 40, 30 * 60_000);
  return uploadImageFromRequest(request, uploadFolders.tradeIns());
});

export const OPTIONS = preflight;