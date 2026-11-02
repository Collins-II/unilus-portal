import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/server/auth";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getServerSession(authOptions)) redirect("/");
  return <Suspense><LoginForm /></Suspense>;
}
