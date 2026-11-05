import { isIP } from "node:net";

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 ||
        (b === 2) || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 ||
        (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  if (family === 6) {
    const parts = address.toLowerCase().split(":");
    const first = parseInt(parts[0], 16);
    const second = parseInt(parts[1] || "0", 16);
    // Only global unicast; exclude documentation, protocol-assignment and 6to4 ranges.
    return first >= 0x2000 && first <= 0x3fff &&
      !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8)) && first !== 0x2002 && first !== 0x3fff;
  }
  return false;
}

export function externalUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("Use an HTTPS API endpoint.");
  if (url.username || url.password || url.hash) throw new Error("Do not include credentials or fragments in the API URL. Use the token field.");
  if (url.port && url.port !== "443") throw new Error("External API endpoints must use HTTPS port 443.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
    host.endsWith(".internal") || (isIP(host) && !isPublicAddress(host))) throw new Error("Private, local and reserved API addresses are not allowed.");
  return url;
}
