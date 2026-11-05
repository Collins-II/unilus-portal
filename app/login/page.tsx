import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/http";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  let authenticated = false;
  try { await requireStaff(); authenticated = true; }
  catch (error) { if (!(error instanceof HttpError && error.status === 401)) throw error; }
  if (authenticated) redirect("/");
  return <Suspense><LoginForm /></Suspense>;
}
