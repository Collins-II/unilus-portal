import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function errorResponse(error: unknown, headers?: HeadersInit) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status, headers });
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const field = issue?.path.join(".");
    return NextResponse.json({ error: field ? `${field}: ${issue.message}` : issue?.message ?? "Invalid input" }, { status: 422, headers });
  }
  if (error && typeof error === "object" && "code" in error && (error as { code: number }).code === 11000) {
    const key = Object.keys((error as { keyValue?: object }).keyValue ?? {})[0];
    return NextResponse.json({ error: key ? `A record with this ${key} already exists.` : "Duplicate record." }, { status: 409, headers });
  }
  console.error("[api]", error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500, headers });
}

/** Wraps a route handler so thrown HttpError/ZodError values become JSON error responses. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const result = await fn(...args);
      return result instanceof Response ? result : NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

export function requireObjectId(id: string, label = "record") {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new HttpError(404, `This ${label} could not be found.`);
  return id;
}

export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

const buckets = new Map<string, { count: number; reset: number }>();
/**
 * Fixed-window in-memory rate limiter. Suitable for a single instance;
 * use a shared store (e.g. Redis) when running multiple replicas.
 */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    if (buckets.size > 10_000) for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
    buckets.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) throw new HttpError(429, "Too many requests. Please wait a moment and try again.");
}

export function allowedOrigins() {
  return (process.env.CLIENT_ORIGINS ?? "http://localhost:3000").split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean);
}

export function clientUrl() {
  return (process.env.CLIENT_URL ?? allowedOrigins()[0] ?? "http://localhost:3000").replace(/\/$/, "");
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

/** Public, CORS-enabled route handler for the customer-facing website. */
export function publicHandler<A extends [Request, ...unknown[]]>(fn: (...args: A) => Promise<unknown>, options: { cacheSeconds?: number } = {}) {
  return async (...args: A) => {
    const headers = corsHeaders(args[0]);
    try {
      const data = await fn(...args);
      const cache = options.cacheSeconds
        ? `public, s-maxage=${options.cacheSeconds}, stale-while-revalidate=${options.cacheSeconds * 4}`
        : "no-store";
      return NextResponse.json(data, { headers: { ...headers, "Cache-Control": cache } });
    } catch (error) {
      return errorResponse(error, headers);
    }
  };
}

export function preflight(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
