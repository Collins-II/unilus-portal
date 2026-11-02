"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, KeyRound, Loader2, Mail, MessageSquareText, Phone, RefreshCw, ShieldCheck, UserPlus, X } from "lucide-react";
import { CURRENCIES, ROLES, type AuditEntry, type Settings, type StaffMember, type WorkspaceData } from "@/lib/domain";
import { api, errorMessage } from "@/lib/client/api";
import { PreferenceSwitchers } from "@/components/dealer/shell";
import { usePreferences } from "@/lib/client/preferences";
import { mutate, useWorkspace } from "@/lib/client/workspace";
import { Field } from "./record-form";

type MessagingStatus = { email: boolean; sms: boolean; whatsapp: boolean };
type Notice = { tone: "ok" | "error"; text: string } | null;

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return <div className={notice.tone === "error" ? "form-error" : "form-success"} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</div>;
}

export function SettingsPanel() {
  const { data } = useWorkspace();
  if (!data) return null;
  return <SettingsView data={data} />;
}

function SettingsView({ data }: { data: WorkspaceData }) {
  const { t } = usePreferences();
  const isAdmin = data.me.role === "admin";
  const [messaging, setMessaging] = useState<MessagingStatus | null>(null);
  useEffect(() => {
    api<{ messaging: MessagingStatus }>("/api/settings").then((r) => setMessaging(r.messaging)).catch(() => setMessaging(null));
  }, []);

  return (
    <div className="portal-content">
      <div className="page-heading"><div><div className="eyebrow">{data.settings.dealership.toUpperCase()}</div><h1>{t("title.settings")}</h1><p>{t("sub.settings")}</p></div></div>
      <div className="settings-layout">
        <div className="settings-main">
          <DealershipForm key={JSON.stringify(data.settings)} settings={data.settings} editable={isAdmin} hasRecords={data.vehicles.length > 0 || data.sales.length > 0} />
          {isAdmin && <TeamPanel meId={data.me.id} />}
          <PasswordPanel />
          {isAdmin && <AuditPanel />}
        </div>
        <aside className="settings-aside">
          <span className="local-badge"><span /> {t("common.language").toUpperCase()} & {t("common.currency").toUpperCase()}</span>
          <p>These preferences apply to this browser only. Prices are always stored in {data.settings.currency}.</p>
          <PreferenceSwitchers baseCurrency={data.settings.currency} />
          <span className="local-badge"><span /> {t("settings.messaging").toUpperCase()}</span>
          <ul className="status-list">
            <li><Mail size={16} /><span>Email (Resend)</span><StatusPill on={messaging?.email} /></li>
            <li><Phone size={16} /><span>SMS (Twilio)</span><StatusPill on={messaging?.sms} /></li>
            <li><MessageSquareText size={16} /><span>WhatsApp (Twilio)</span><StatusPill on={messaging?.whatsapp} /></li>
          </ul>
          <p>Website enquiries are always saved to the inbox. Email and SMS delivery activate automatically once the provider credentials are set on the server.</p>
          <div><ShieldCheck size={17} /><span>Signed in as {data.me.email} ({data.me.role}).</span></div>
        </aside>
      </div>
    </div>
  );
}

function StatusPill({ on }: { on: boolean | undefined }) {
  if (on === undefined) return <span className="status-pill">…</span>;
  return <span className={`status-pill ${on ? "on" : ""}`}>{on ? "Connected" : "Not configured"}</span>;
}

function DealershipForm({ settings, editable, hasRecords }: { settings: Settings; editable: boolean; hasRecords: boolean }) {
  const { t } = usePreferences();
  const [currency, setCurrency] = useState(settings.currency);
  const [rates, setRates] = useState<Record<string, string>>(Object.fromEntries(Object.entries(settings.rates).map(([k, v]) => [k, String(v)])));
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    setSaving("save");
    setNotice(null);
    try {
      await mutate(() => api("/api/settings", {
        method: "PUT",
        body: {
          dealership: text("dealership"), email: text("email"), phone: text("phone"), whatsapp: text("whatsapp"), address: text("address"), currency,
          rates: Object.fromEntries(Object.entries(rates).filter(([code, value]) => code !== currency && Number(value) > 0).map(([code, value]) => [code, Number(value)])),
          notifyEmail: form.get("notifyEmail") === "on", notifySms: form.get("notifySms") === "on",
        },
      }));
      setNotice({ tone: "ok", text: "Settings saved. Your website now shows the updated details." });
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setSaving("");
    }
  }

  async function refreshRates() {
    setSaving("rates");
    setNotice(null);
    try {
      const { rates: fresh } = await mutate(() => api<{ rates: Record<string, number> }>("/api/settings/rates", { method: "POST" }));
      setRates(Object.fromEntries(Object.entries(fresh).map(([k, v]) => [k, String(Number(v.toPrecision(6)))])));
      setNotice({ tone: "ok", text: "Exchange rates updated from the live market feed." });
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setSaving("");
    }
  }

  return (
    <section className="dealer-panel settings-panel">
      <div className="panel-heading"><div><h2>{t("settings.dealership")}</h2><p>{editable ? "Shown on your website and in customer emails." : "Only administrators can change these details."}</p></div></div>
      <form onSubmit={save}>
        <fieldset disabled={!editable || !!saving}>
          <div className="record-fields">
            <Field label="Dealership name" name="dealership" value={settings.dealership} />
            <Field label="Public email" name="email" type="email" value={settings.email} />
            <Field label="Phone number" name="phone" type="tel" value={settings.phone} />
            <Field label="WhatsApp number" name="whatsapp" type="tel" value={settings.whatsapp} required={false} placeholder="+260970000000" />
            <div className="full-width"><Field label="Address" name="address" value={settings.address} required={false} /></div>
          </div>
          <h3 className="settings-subheading">{t("settings.currency")}</h3>
          <div className="record-fields">
            <label className="form-field">
              <span>Base currency</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as Settings["currency"])} disabled={hasRecords}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
              {hasRecords && <small className="field-hint">Locked because prices and sales already exist in {settings.currency}.</small>}
            </label>
            <div className="form-field"><span>Live rates</span><button type="button" className="secondary-button" onClick={() => void refreshRates()}>{saving === "rates" ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}{t("settings.refresh")}</button></div>
            {CURRENCIES.filter((code) => code !== currency).map((code) => (
              <label className="form-field" key={code}>
                <span>1 {currency} = ? {code}</span>
                <input type="number" min="0" step="any" value={rates[code] ?? ""} placeholder="Not shown" onChange={(e) => setRates({ ...rates, [code]: e.target.value })} />
              </label>
            ))}
          </div>
          <h3 className="settings-subheading">Notifications</h3>
          <label className="notification-setting"><span><strong>Email alerts</strong><small>Email the team when a customer sends an enquiry or message.</small></span><input name="notifyEmail" type="checkbox" defaultChecked={settings.notifyEmail} /></label>
          <label className="notification-setting"><span><strong>SMS / WhatsApp</strong><small>Text the duty phone on new enquiries, and text customers when you reply.</small></span><input name="notifySms" type="checkbox" defaultChecked={settings.notifySms} /></label>
        </fieldset>
        <NoticeLine notice={notice} />
        {editable && <div className="dialog-actions"><button type="submit" className="primary-button" disabled={!!saving}>{saving === "save" ? <Loader2 size={16} className="spin" /> : <Check size={16} />}{t("action.save")}</button></div>}
      </form>
    </section>
  );
}

function TeamPanel({ meId }: { meId: string }) {
  const { t, locale } = usePreferences();
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const load = useCallback(() => api<StaffMember[]>("/api/staff").then(setStaff).catch((e) => setNotice({ tone: "error", text: errorMessage(e) })), []);
  useEffect(() => { void load(); }, [load]);

  async function change(id: string, body: Partial<StaffMember> & { password?: string }, message: string) {
    setNotice(null);
    try {
      await api(`/api/staff/${id}`, { method: "PATCH", body });
      await load();
      setNotice({ tone: "ok", text: message });
      return true;
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
      return false;
    }
  }

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setNotice(null);
    try {
      await api("/api/staff", { body: { name: form.get("name"), email: form.get("email"), role: form.get("role"), password: form.get("password") } });
      setAdding(false);
      await load();
      setNotice({ tone: "ok", text: "Team member added. Share their temporary password securely and ask them to change it after signing in." });
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    }
  }

  return (
    <section className="dealer-panel settings-panel">
      <div className="panel-heading"><div><h2>{t("settings.team")}</h2><p>Everyone with access to this portal.</p></div>{!adding && <button className="secondary-button" onClick={() => setAdding(true)}><UserPlus size={15} />Add member</button>}</div>
      {adding && <form className="inline-form" onSubmit={add}>
        <div className="record-fields">
          <Field label="Full name" name="name" />
          <Field label="Email address" name="email" type="email" />
          <Field label="Role" name="role" value="staff">{ROLES.map((r) => <option key={r} value={r}>{r === "admin" ? "Administrator" : "Sales team"}</option>)}</Field>
          <Field label="Temporary password" name="password" type="password" />
        </div>
        <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setAdding(false)}>{t("action.cancel")}</button><button className="primary-button"><UserPlus size={15} />Add member</button></div>
      </form>}
      <NoticeLine notice={notice} />
      <div className="table-scroll"><table>
        <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Actions</th></tr></thead>
        <tbody>{(staff ?? []).map((member) => <tr key={member.id}>
          <td><div className="stacked-cell"><strong>{member.name}{member.id === meId && " (you)"}</strong><small>{member.email}</small></div></td>
          <td><select className="stage-select" aria-label={`Role for ${member.name}`} value={member.role} onChange={(e) => void change(member.id, { role: e.target.value as StaffMember["role"] }, "Role updated.")}>{ROLES.map((r) => <option key={r} value={r}>{r === "admin" ? "Administrator" : "Sales team"}</option>)}</select></td>
          <td><span className={`status-badge ${member.active ? "green" : "gray"}`}><i />{member.active ? "Active" : "Deactivated"}</span></td>
          <td>{member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : "Never"}</td>
          <td><div className="table-actions">
            {member.id !== meId && <button className="small-button" onClick={() => void change(member.id, { active: !member.active }, member.active ? "Access removed." : "Access restored.")}>{member.active ? "Deactivate" : "Reactivate"}</button>}
            {member.id !== meId && <button className="icon-button" aria-label={`Reset password for ${member.name}`} title="Reset password" onClick={() => setResetting(member.id)}><KeyRound size={15} /></button>}
          </div></td>
        </tr>)}</tbody>
      </table></div>
      {!staff && !notice && <p className="muted-line"><Loader2 size={14} className="spin" /> Loading team…</p>}
      {resetting && <form className="inline-form" onSubmit={async (event) => {
        event.preventDefault();
        const password = String(new FormData(event.currentTarget).get("password") ?? "");
        if (await change(resetting, { password }, "Password reset. Any lockout on the account has been cleared.")) setResetting(null);
      }}>
        <div className="record-fields"><div className="full-width"><Field label={`New password for ${staff?.find((s) => s.id === resetting)?.name ?? "member"}`} name="password" type="password" /></div></div>
        <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setResetting(null)}><X size={15} />{t("action.cancel")}</button><button className="primary-button"><KeyRound size={15} />Reset password</button></div>
      </form>}
    </section>
  );
}

function PasswordPanel() {
  const { t } = usePreferences();
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (form.get("next") !== form.get("confirm")) return setNotice({ tone: "error", text: "The new passwords don't match." });
    setSaving(true);
    setNotice(null);
    try {
      await api("/api/account/password", { body: { current: form.get("current"), next: form.get("next") } });
      formElement.reset();
      setNotice({ tone: "ok", text: "Password changed." });
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="dealer-panel settings-panel">
      <div className="panel-heading"><div><h2>{t("settings.password")}</h2><p>Use at least 10 characters. A passphrase works well.</p></div></div>
      <form onSubmit={submit}>
        <div className="record-fields">
          <div className="full-width"><Field label="Current password" name="current" type="password" /></div>
          <Field label="New password" name="next" type="password" />
          <Field label="Confirm new password" name="confirm" type="password" />
        </div>
        <NoticeLine notice={notice} />
        <div className="dialog-actions"><button className="primary-button" disabled={saving}>{saving ? <Loader2 size={16} className="spin" /> : <KeyRound size={16} />}{t("settings.password")}</button></div>
      </form>
    </section>
  );
}

function AuditPanel() {
  const { t, locale } = usePreferences();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<AuditEntry[]>("/api/audit").then(setEntries).catch((e) => setError(errorMessage(e))); }, []);
  return (
    <section className="dealer-panel settings-panel">
      <div className="panel-heading"><div><h2>{t("settings.audit")}</h2><p>The last 100 changes made in this portal.</p></div></div>
      {error && <div className="form-error">{error}</div>}
      <ul className="audit-list">
        {(entries ?? []).map((entry) => <li key={entry.id}><span><strong>{entry.actor}</strong> {entry.summary}</span><small>{new Date(entry.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</small></li>)}
      </ul>
      {entries && !entries.length && <p className="muted-line">No activity recorded yet.</p>}
    </section>
  );
}
