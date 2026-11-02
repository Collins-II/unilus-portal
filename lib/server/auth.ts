import "server-only";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { connectToDatabase } from "@/lib/database";
import { Staff } from "@/lib/database/models";
import type { Role } from "@/lib/domain";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { HttpError, rateLimit } from "@/lib/server/http";

declare module "next-auth" {
  interface Session {
    user: { id: string; name: string; email: string; role: Role };
  }
  interface User {
    role: Role;
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
  }
}


const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const credentials = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()), password: z.string().min(1).max(200) });

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
let dummyHash: Promise<string> | undefined;

/** Creates the first administrator from ADMIN_EMAIL / ADMIN_PASSWORD when no staff accounts exist yet. */
async function bootstrapAdmin(email: string, password: string) {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword || email !== adminEmail || password !== adminPassword) return;
  if (await Staff.estimatedDocumentCount() > 0) return;
  await Staff.create({ name: process.env.ADMIN_NAME || "Administrator", email: adminEmail, passwordHash: await hashPassword(adminPassword), role: "admin" });
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  cookies: {
    sessionToken: {
      name: SESSION_COOKIE,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: SESSION_COOKIE.startsWith("__Secure-") },
    },
  },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(raw, req) {
        const parsed = credentials.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const ip = (req?.headers?.["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? "local";
        try {
          rateLimit(`login:${ip}`, 20, 15 * 60_000);
        } catch {
          throw new Error("Too many sign-in attempts. Please wait a few minutes.");
        }
        await connectToDatabase();
        await bootstrapAdmin(email, password);
        const user = await Staff.findOne({ email }).select("+passwordHash +failedLogins +lockedUntil");
        if (!user || !user.active) {
          // Spend comparable time to a real check so response timing doesn't reveal which emails exist.
          await bcrypt.compare(password, await (dummyHash ??= hashPassword("not-a-real-password")));
          return null;
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) throw new Error("This account is temporarily locked. Try again later.");
        if (!(await bcrypt.compare(password, user.passwordHash))) {
          user.failedLogins = (user.failedLogins ?? 0) + 1;
          if (user.failedLogins >= MAX_FAILED_LOGINS) {
            user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
            user.failedLogins = 0;
          }
          await user.save();
          return null;
        }
        user.failedLogins = 0;
        user.lockedUntil = undefined;
        user.lastLoginAt = new Date();
        await user.save();
        return { id: user._id.toString(), name: user.name, email: user.email, role: user.role as Role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = { id: token.id ?? "", name: token.name ?? "", email: token.email ?? "", role: token.role ?? "staff" };
      return session;
    },
  },
};

export type StaffSession = { id: string; name: string; email: string; role: Role };

/** Resolves the signed-in staff member, re-checking the database so deactivated accounts lose access immediately. */
export async function requireStaff(role?: Role): Promise<StaffSession> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new HttpError(401, "Please sign in to continue.");
  await connectToDatabase();
  const user = await Staff.findById(session.user.id).lean();
  if (!user || !user.active) throw new HttpError(401, "Your account is no longer active.");
  if (role === "admin" && user.role !== "admin") throw new HttpError(403, "Only administrators can do this.");
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role as Role };
}
