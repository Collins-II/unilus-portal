"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { ArrowUpRight, Bell, CalendarDays, CarFront, ChartNoAxesCombined, ChevronRight, CircleHelp, Command, Globe, LayoutDashboard, LogOut, Menu, MessagesSquare, RefreshCw, Repeat2, Search, Settings2, Users, UsersRound, Wallet, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CURRENCIES, initials, vehicleTitle, type Currency } from "@/lib/domain";
import { LANGUAGES, usePreferences, type Language, type MessageKey } from "@/lib/client/preferences";
import { refreshWorkspace, useWorkspace } from "@/lib/client/workspace";
import BrandLogo from "@/components/brand-logo";

const navigation: { key: MessageKey; href: string; icon: typeof LayoutDashboard }[] = [
  { key: "nav.overview", href: "/", icon: LayoutDashboard },
  { key: "nav.messages", href: "/messages", icon: MessagesSquare },
  { key: "nav.inventory", href: "/admin/inventory", icon: CarFront },
  { key: "nav.tradeIns", href: "/admin/trade-ins", icon: Repeat2 },
  { key: "nav.leads", href: "/admin/leads", icon: UsersRound },
  { key: "nav.sales", href: "/admin/sales", icon: Wallet },
  { key: "nav.appointments", href: "/admin/appointments", icon: CalendarDays },
  { key: "nav.customers", href: "/admin/customers", icon: Users },
  { key: "nav.reports", href: "/admin/reports", icon: ChartNoAxesCombined },
];

const websiteUrl = process.env.NEXT_PUBLIC_CLIENT_URL || "http://localhost:3000";

export function PreferenceSwitchers({ baseCurrency, compact = false }: { baseCurrency?: string; compact?: boolean }) {
  const { t, language, setLanguage, displayCurrency, setDisplayCurrency } = usePreferences();
  return (
    <div className={`pref-switchers ${compact ? "compact" : ""}`}>
      <label className="pref-select" title={t("common.language")}>
        <Globe size={14} />
        <select aria-label={t("common.language")} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{compact ? l.code.toUpperCase() : l.label}</option>)}
        </select>
      </label>
      {baseCurrency && (
        <label className="pref-select" title={t("common.currency")}>
          <span className="pref-symbol">¤</span>
          <select aria-label={t("common.currency")} value={displayCurrency === "base" ? baseCurrency : displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value === baseCurrency ? "base" : (e.target.value as Currency))}>
            {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

export function DealerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return <>{children}</>;
  return <Workspace>{children}</Workspace>;
}

function Workspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = usePreferences();
  const { data, error, loading } = useWorkspace();
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState(false);
  const [help, setHelp] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if (event.key === "Escape") {
        setSearch("");
        setNotifications(false);
        setMobile(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!data) {
    return (
      <div className="workspace-status">
        <BrandLogo />
        {error && !loading ? <><strong>{t("common.offline")}</strong><p>{error}</p><button className="primary-button" onClick={() => void refreshWorkspace()}><RefreshCw size={15} />{t("action.retry")}</button></> : <p>{t("common.loading")}</p>}
      </div>
    );
  }

  const { settings, me } = data;
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const current = navigation.find((item) => active(item.href));
  const page = current ? t(current.key) : pathname === "/admin/settings" ? t("nav.settings") : t("nav.workspace");
  const term = search.trim().toLowerCase();
  const results = term ? [
    ...data.vehicles.filter((v) => `${vehicleTitle(v)} ${v.stock} ${v.year}`.toLowerCase().includes(term)).map((v) => ({ title: `${v.year} ${vehicleTitle(v)}`, detail: `${v.stock} · ${v.status}`, href: `/admin/inventory?q=${encodeURIComponent(v.stock)}` })),
    ...data.leads.filter((l) => `${l.name} ${l.email} ${l.phone}`.toLowerCase().includes(term)).map((l) => ({ title: l.name, detail: l.email, href: `/admin/customers?q=${encodeURIComponent(l.email)}` })),
  ].slice(0, 7) : [];
  const requested = data.appointments.filter((a) => a.status === "Requested").length;
  const newLeads = data.leads.filter((l) => l.stage === "New").length;
  const pending = data.unreadMessages + requested + data.newTradeIns;
  const badges: Record<string, number> = { "/messages": data.unreadMessages, "/admin/trade-ins": data.newTradeIns, "/admin/leads": newLeads, "/admin/appointments": requested };

  return (
    <div className="dealer-app">
      {mobile && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobile(false)} />}
      <aside className={`dealer-sidebar ${mobile ? "is-open" : ""}`}>
        <Link href="/" aria-label="Linkdrive Auto Hub workspace" className="dealer-brand" onClick={() => setMobile(false)}><BrandLogo /></Link>
        <a href={websiteUrl} target="_blank" rel="noreferrer" className="workspace-switch"><span className="workspace-avatar">{initials(settings.dealership).slice(0, 1)}</span><span><strong>{settings.dealership}</strong><small><i /> {t("nav.website")}</small></span><ArrowUpRight size={15} /></a>
        <div className="nav-label">{t("nav.workspace").toUpperCase()}</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ key, href, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setMobile(false)} className={`dealer-nav-item ${active(href) ? "active" : ""}`}>
              <Icon size={19} /><span>{t(key)}</span>{!!badges[href] && <b>{badges[href]}</b>}{active(href) && <span className="active-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/admin/settings" onClick={() => setMobile(false)} className={`dealer-nav-item ${pathname === "/admin/settings" ? "active" : ""}`}><Settings2 size={19} />{t("nav.settings")}</Link>
          <button className="dealer-nav-item" onClick={() => setHelp(true)}><CircleHelp size={19} />Help & getting started</button>
          <div className="sidebar-profile">
            <span className="person-avatar dark-avatar">{initials(me.name)}</span>
            <span><strong>{me.name}</strong><small>{me.role === "admin" ? "Administrator" : "Sales team"}</small></span>
            <button className="icon-button" aria-label={t("nav.signOut")} title={t("nav.signOut")} onClick={() => void signOut({ callbackUrl: "/login" })}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
      <div className="dealer-workspace">
        <header className="dealer-topbar">
          <div className="topbar-breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobile(true)}><Menu size={20} /></button><span className="breadcrumb-root">{t("nav.workspace")}</span><ChevronRight size={14} /><strong>{page}</strong></div>
          <div className="topbar-actions">
            <div className="global-search"><Search size={16} /><input ref={searchInput} aria-label="Search vehicles and customers" placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} /><span><Command size={11} /> K</span>
              {search && <div className="search-results"><small>VEHICLES & CUSTOMERS</small>{results.length ? results.map((r) => <button key={`${r.href}-${r.title}`} onClick={() => { router.push(r.href); setSearch(""); }}><Search size={15} /><span><strong>{r.title}</strong><small>{r.detail}</small></span><ArrowUpRight size={14} /></button>) : <p>No matching records found.</p>}</div>}
            </div>
            <PreferenceSwitchers baseCurrency={settings.currency} compact />
            <div className="notification-wrap"><button className="icon-button notification-button" aria-label="View notifications" onClick={() => setNotifications(!notifications)}><Bell size={19} />{pending > 0 && <i />}</button>
              {notifications && <div className="notification-panel">
                <div className="panel-heading"><strong>{t("common.updates")}</strong><button className="icon-button" aria-label="Close notifications" onClick={() => setNotifications(false)}><X size={16} /></button></div>
                <p>{data.unreadMessages} unread customer {data.unreadMessages === 1 ? "message" : "messages"}.</p><Link href="/messages" onClick={() => setNotifications(false)}>Open inbox <ArrowUpRight size={14} /></Link>
                                <p>{data.newTradeIns} new sell / swap {data.newTradeIns === 1 ? "request" : "requests"} to review.</p><Link href="/admin/trade-ins" onClick={() => setNotifications(false)}>Review trade-ins <ArrowUpRight size={14} /></Link>
                                <p>{requested} test-drive {requested === 1 ? "request needs" : "requests need"} confirmation.</p><Link href="/admin/appointments" onClick={() => setNotifications(false)}>View appointments <ArrowUpRight size={14} /></Link>
                <p>{newLeads} new {newLeads === 1 ? "lead is" : "leads are"} ready for a follow-up.</p><Link href="/admin/leads" onClick={() => setNotifications(false)}>Open lead pipeline <ArrowUpRight size={14} /></Link>
              </div>}
            </div>
            <span className="topbar-divider" /><Link href="/admin/settings" className="person-avatar header-avatar" aria-label="Account settings" title={me.email}>{initials(me.name)}</Link>
          </div>
        </header>
        {error && <div role="alert" className="storage-error">{error} Showing the last loaded data.</div>}
        <main className="dealer-main">{children}</main>
        <footer className="dealer-footer"><span>&copy; {new Date().getFullYear()} {settings.dealership}</span><span><i /> Signed in as {me.email}</span></footer>
      </div>
      <Dialog open={help} onOpenChange={setHelp}><DialogContent className="dealer-dialog"><DialogTitle>Getting started</DialogTitle><DialogDescription>Everything you do here is saved to your dealership database and published to your website in real time.</DialogDescription><div className="help-steps">
        <p><CarFront size={20} /><span><strong>Publish your inventory</strong>Add vehicles with photos. Published, unsold vehicles appear on the website automatically.</span></p>
        <p><MessagesSquare size={20} /><span><strong>Answer enquiries</strong>Website enquiries land in Messages. Replies are emailed to the customer with a private link back to the conversation.</span></p>
        <p><CalendarDays size={20} /><span><strong>Confirm test drives</strong>Requests booked online appear in Appointments as &ldquo;Requested&rdquo; until you confirm them.</span></p>
        <p><Wallet size={20} /><span><strong>Record sales</strong>Recording a sale marks the vehicle sold, removes it from the website and closes the lead as won.</span></p>
      </div><button className="primary-button" onClick={() => setHelp(false)}>Got it</button></DialogContent></Dialog>
    </div>
  );
}
