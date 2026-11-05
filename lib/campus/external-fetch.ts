import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { HttpError } from "../server/http.ts";
import { MAX_IMPORT_BYTES } from "./import-policy.ts";
import { externalUrl, isPublicAddress } from "./external-url.ts";

export async function fetchImportData(rawUrl: string, token: string): Promise<unknown> {
  let url: URL;
  try { url = externalUrl(rawUrl); }
  catch (error) { throw new HttpError(422, error instanceof Error ? error.message : "Invalid API URL."); }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: { address: string; family: number }[];
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] :
      await Promise.race([
        lookup(hostname, { all: true }),
        new Promise<never>((_resolve, reject) => { dnsTimer = setTimeout(() => reject(new HttpError(504, "The API hostname could not be resolved within 5 seconds.")), 5000); }),
      ]);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "The API hostname could not be resolved.");
  } finally { if (dnsTimer) clearTimeout(dnsTimer); }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new HttpError(422, "The API hostname resolves to a private or reserved address.");
  const target = addresses[0];
  // Pin the checked DNS address to the actual socket; never follow redirects.
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: "GET", agent: false, family: target.family,
      lookup: (_hostname, options, callback) => options.all ? callback(null, [target]) : callback(null, target.address, target.family),
      headers: { Accept: "application/json", "Accept-Encoding": "identity", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }, (response) => {
      const status = response.statusCode ?? 502;
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new HttpError(502, status >= 300 && status < 400 ? "API redirects are not followed. Enter the final HTTPS endpoint." : `External API returned HTTP ${status}. Check the endpoint and authentication.`));
        return;
      }
      if (!/^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:;|$)/i.test(response.headers["content-type"] ?? "")) {
        response.resume();
        reject(new HttpError(502, "The external API must return JSON with an application/json content type."));
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      let failure: HttpError | undefined;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_IMPORT_BYTES) {
          failure = new HttpError(422, "The API response exceeds the 2 MiB import limit.");
          req.destroy(failure);
        }
        else chunks.push(chunk);
      });
      response.on("error", () => reject(failure ?? new HttpError(502, "The API response was interrupted. Try again.")));
      response.on("end", () => {
        if (failure) { reject(failure); return; }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch { reject(new HttpError(502, "The external API returned invalid JSON.")); }
      });
    });
    const timeout = setTimeout(() => req.destroy(new HttpError(504, "The external API did not respond within 15 seconds.")), 15000);
    req.on("close", () => clearTimeout(timeout));
    req.on("error", (error) => reject(error instanceof HttpError ? error : new HttpError(502, "Could not connect securely to the external API.")));
    req.end();
  });
}
