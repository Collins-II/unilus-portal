"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, LockKeyhole } from "lucide-react";
import BrandLogo from "@/components/brand-logo";
import { usePreferences } from "@/lib/client/preferences";

/** Only allow same-site relative callback paths to avoid open redirects. */
function safeCallback(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/login") ? value : "/";
}

export function LoginForm() {
  const { t } = usePreferences();
  const params = useSearchParams();
  const callbackUrl = safeCallback(params.get("callbackUrl"));
  const [error, setError] = useState(params.get("error") ? t("login.invalid") : "");
  const [working, setWorking] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setWorking(true);
    setError("");
    const result = await signIn("credentials", { email: form.get("email"), password: form.get("password"), redirect: false }).catch(() => null);
    if (result?.ok && !result.error) {
      window.location.assign(callbackUrl);
      return;
    }
    setWorking(false);
    setError(!result ? t("common.offline") : result.error === "CredentialsSignin" ? t("login.invalid") : result.error ?? t("login.invalid"));
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-brand"><BrandLogo /></div>
        <p>UNILUS · Authorized staff access ·</p>
        <form onSubmit={submit}>
          <label className="form-field"><span>{t("login.email")}</span><input name="email" type="email" autoComplete="username" required autoFocus /></label>
          <label className="form-field"><span>{t("login.password")}</span><input name="password" type="password" autoComplete="current-password" required /></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary-button" disabled={working}>{working ? <Loader2 size={16} className="spin" /> : <LockKeyhole size={16} />}{working ? t("login.working") : t("login.submit")}</button>
        </form>
        <small className="login-help">Use your campus staff account. Students sign in through the student application.</small>
        <Link className="text-link login-help" href="/setup">Initial administrator setup</Link>
      </div>
    </main>
  );
}
