import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { SESSION_COOKIE } from "@/lib/session-cookie";

const PUBLIC_PATHS = ["/login", "/setup", "/api/auth", "/api/public", "/api/health", "/api/integration"];

/** Requires a staff session for every page and API route except sign-in, auth and the public website API. */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return NextResponse.next();

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET, cookieName: SESSION_COOKIE });
  if (token) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|cars/|.*\\.(?:png|jpg|jpeg|svg|webp|avif|ico)$).*)"],
};
