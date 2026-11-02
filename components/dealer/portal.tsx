"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUpRight, CalendarCheck, CalendarDays, CarFront, Check, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, DatabaseZap, EyeOff, Fuel, Gauge, LayoutGrid, List, Loader2, MessagesSquare, Pencil, Plus, Search, SlidersHorizontal, Sparkles, Star, Trash2, TrendingUp, UsersRound, Wallet, X } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LEAD_SOURCES, LEAD_STAGES, initials, localDate, vehicleTitle, type Vehicle, type WorkspaceData } from "@/lib/domain";
import { api, errorMessage, exportCsv } from "@/lib/client/api";
import { isOptimizedImage } from "@/lib/images";
import { useMoney, usePreferences, type MessageKey } from "@/lib/client/preferences";
import { mutate, useWorkspace } from "@/lib/client/workspace";
import { RecordForm, type Editor } from "./record-form";

export type Section = "dashboard" | "inventory" | "leads" | "sales" | "appointments" | "customers" | "reports";
type Money = ReturnType<typeof useMoney>;

function Badge({ value }: { value: string }) {
  const color = ["Available", "Won", "Completed", "Paid"].includes(value) ? "green"
    : ["Reserved", "Negotiation", "Test drive", "Scheduled"].includes(value) ? "amber"
      : ["New", "Contacted", "Requested"].includes(value) ? "blue" : "gray";
  return <span className={`status-badge ${color}`}><i />{value}</span>;
}
function Empty({ title = "No records found", text = "Try another search or add a new record to get started.", children }: { title?: string; text?: string; children?: React.ReactNode }) {
  return <div className="empty-state"><Search size={27} /><h3>{title}</h3><p>{text}</p>{children}</div>;
}
function PanelHeading({ title, subtitle, href, action = "View all" }: { title: string; subtitle?: string; href?: string; action?: string }) {
  return <div className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{href && <Link href={href} className="text-link">{action}<ArrowUpRight size={15} /></Link>}</div>;
}
function VehiclePhoto({ vehicle, sizes }: { vehicle: Vehicle; sizes: string }) {
  const cover = vehicle.images[0];
  return cover
    ? <Image src={cover} alt={`${vehicle.year} ${vehicleTitle(vehicle)}`} fill sizes={sizes} className="vehicle-image" unoptimized={!isOptimizedImage(cover)} />
    : <span className="no-photo"><CarFront size={34} strokeWidth={1.4} /><small>No photo yet</small></span>;
}
function VehicleCard({ vehicle, money, onEdit }: { vehicle: Vehicle; money: Money; onEdit: () => void }) {
  return (
    <button className="vehicle-card" onClick={onEdit}>
      <div className="vehicle-photo">
        <VehiclePhoto vehicle={vehicle} sizes="(max-width: 600px) 90vw, (max-width: 1200px) 40vw, 25vw" />
        <Badge value={vehicle.status} />
        <span className="photo-stock">{vehicle.stock}</span>
        <span className="photo-flags">
          {vehicle.featured && <span title="Featured on the website"><Star size={12} /></span>}
          {!vehicle.published && <span title="Hidden from the website"><EyeOff size={12} /></span>}
        </span>
      </div>
      <div className="vehicle-info">
        <small>{vehicle.year} <span>•</span> {vehicle.body}</small>
        <h3>{vehicleTitle(vehicle)}</h3>
        <div className="vehicle-specs"><span><Gauge size={13} />{(vehicle.mileage / 1000).toFixed(1)}k km</span><span><Fuel size={13} />{vehicle.fuel}</span><span>{vehicle.transmission === "Automatic" ? "Auto" : "Manual"}</span></div>
        <div className="vehicle-price"><strong>{money(vehicle.price)}</strong><span>Edit details <ArrowUpRight size={14} /></span></div>
      </div>
    </button>
  );
}

function RevenueChart({ data, money, locale, months, setMonths }: { data: WorkspaceData; money: Money; locale: string; months: number; setMonths: (value: number) => void }) {
  const now = new Date();
  const chart = Array.from({ length: months }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - months + index + 1, 1);
    const prefix = localDate(date).slice(0, 7);
    const sales = data.sales.filter((s) => s.date.startsWith(prefix));
    return { name: date.toLocaleDateString(locale, { month: "short" }), revenue: sales.reduce((sum, s) => sum + s.amount, 0), sales: sales.length };
  });
  const total = chart.reduce((sum, month) => sum + month.revenue, 0);
  return (
    <section className="dealer-panel revenue-panel">
      <div className="panel-heading">
        <div><h2>Revenue overview</h2><p>A little perspective on your performance</p></div>
        <label className="compact-select">
          <select aria-label="Revenue chart period" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            <option value={6}>Last 6 months</option><option value={12}>Last 12 months</option>
          </select>
          <ChevronDown size={13} />
        </label>
      </div>
      <div className="revenue-summary">
        <strong>{money(total)}</strong>
        <span><span className="subtle-green"><TrendingUp size={13} /> {chart.reduce((sum, m) => sum + m.sales, 0)} completed deals</span><small>in this period</small></span>
        <div className="chart-legend"><i /> Revenue</div>
      </div>
      <div className="revenue-chart">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 600, height: 180 }}>
          <AreaChart data={chart} margin={{ top: 15, right: 10, left: 5, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2379d6" stopOpacity={0.24} />
                <stop offset="100%" stopColor="#2379d6" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#eceeef" strokeDasharray="4 4" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#96989b", fontSize: 11 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} width={64} tick={{ fill: "#96989b", fontSize: 10 }} tickFormatter={(v: number) => money(v, true)} />
            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e7eaec", fontSize: 12 }} formatter={(value) => [money(Number(value)), "Revenue"]} />
            <Area type="monotone" dataKey="revenue" stroke="#2379d6" strokeWidth={2.5} fill="url(#revenueFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function InventorySummary({ data }: { data: WorkspaceData }) {
  const counts = ["Available", "Reserved", "Sold"].map((status) => ({ status, count: data.vehicles.filter((v) => v.status === status).length }));
  const total = data.vehicles.length;
  const available = counts[0].count / (total || 1) * 100;
  const reserved = counts[1].count / (total || 1) * 100;
  return (
    <section className="dealer-panel inventory-summary">
      <PanelHeading title="Inventory breakdown" subtitle="A snapshot of your showroom" />
      <div className="inventory-donut" style={{ background: `conic-gradient(#1769c2 0% ${available}%, #9bbfea ${available}% ${available + reserved}%, #e6e9ec ${available + reserved}% 100%)` }} role="img" aria-label={counts.map((c) => `${c.count} ${c.status}`).join(", ")}><div><strong>{total}</strong><span>Total vehicles</span></div></div>
      <div className="inventory-legend">{counts.map((item, i) => <div key={item.status}><span><i className={`legend-dot dot-${i}`} />{item.status}</span><strong>{item.count}<small>{Math.round(item.count / (total || 1) * 100)}%</small></strong></div>)}</div>
      <Link className="inventory-manage" href="/admin/inventory">Manage inventory<ArrowRight size={15} /></Link>
    </section>
  );
}

export function DealerPortal({ section, initialSearch = "" }: { section: Section; initialSearch?: string }) {
  const { data } = useWorkspace();
  if (!data) return null;
  return <PortalView data={data} section={section} initialSearch={initialSearch} />;
}

function PortalView({ data, section, initialSearch }: { data: WorkspaceData; section: Section; initialSearch: string }) {
  const { t, locale } = usePreferences();
  const money = useMoney(data.settings);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState(initialSearch);
  const [filter, setFilter] = useState("All");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [months, setMonths] = useState(6);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [busy, setBusy] = useState("");
  const [date, setDate] = useState(localDate(new Date()));
  const [appointmentScope, setAppointmentScope] = useState(initialSearch ? "all" : "upcoming");
  const [sort, setSort] = useState("newest");
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), toast.startsWith("Error:") ? 8000 : 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const displayDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
  const timeLabel = (value: string) => new Date(`2000-01-01T${value}`).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const today = localDate(new Date());
  const month = today.slice(0, 7);
  const previousMonth = localDate(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)).slice(0, 7);
  const currentSales = data.sales.filter((s) => s.date.startsWith(month));
  const priorSales = data.sales.filter((s) => s.date.startsWith(previousMonth));
  const revenue = currentSales.reduce((sum, s) => sum + s.amount, 0);
  const priorRevenue = priorSales.reduce((sum, s) => sum + s.amount, 0);
  const growth = priorRevenue ? ((revenue - priorRevenue) / priorRevenue * 100) : 0;
  const activeLeads = data.leads.filter((l) => !["Won", "Lost"].includes(l.stage));
  const term = query.trim().toLowerCase();
  const matches = (value: string) => value.toLowerCase().includes(term);
  const vehicleById = new Map(data.vehicles.map((v) => [v.id, v]));
  const vehicleName = (id: string) => (id ? (vehicleById.get(id) ? vehicleTitle(vehicleById.get(id)!) : "Vehicle unavailable") : "General enquiry");
  const vehicleRows = data.vehicles
    .filter((v) => matches(`${vehicleTitle(v)} ${v.stock} ${v.year} ${v.color}`) && (filter === "All" || v.status === filter))
    .sort((a, b) => sort === "price-low" ? a.price - b.price : sort === "price-high" ? b.price - a.price : b.added.localeCompare(a.added));
  const pages = Math.max(1, Math.ceil(vehicleRows.length / 8));
  const visiblePage = Math.min(page, pages);
  const leadRows = data.leads.filter((l) => matches(`${l.name} ${l.email} ${l.phone} ${vehicleName(l.vehicleId)}`) && (filter === "All" || l.stage === filter));
  const saleRows = data.sales.filter((s) => matches(`${s.customer} ${vehicleName(s.vehicleId)} ${s.payment}`));
  const customers = Array.from(new Map([...data.leads].reverse().map((l) => [l.email.toLowerCase(), l])).values())
    .reverse().filter((l) => matches(`${l.name} ${l.email} ${l.phone}`));
  const appointmentRows = data.appointments
    .filter((a) => (appointmentScope === "all" || (appointmentScope === "day" ? a.date === date : a.date >= today && ["Requested", "Scheduled"].includes(a.status))) && matches(`${a.customer} ${a.email} ${vehicleName(a.vehicleId)} ${a.type}`))
    .sort((a, b) => (appointmentScope === "all" ? -1 : 1) * `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const todayAppointments = data.appointments.filter((a) => a.date === today && a.status === "Scheduled").sort((a, b) => a.time.localeCompare(b.time));
  const requested = data.appointments.filter((a) => a.status === "Requested");
  const isAdmin = data.me.role === "admin";

  async function run(key: string, request: () => Promise<unknown>, message: string) {
    setBusy(key);
    try {
      await mutate(request);
      setToast(message);
    } catch (error) {
      setToast(`Error: ${errorMessage(error)}`);
    } finally {
      setBusy("");
    }
  }
  const changeLeadStage = (id: string, stage: string) => run(`lead-${id}`, () => api(`/api/leads/${id}`, { method: "PATCH", body: { stage } }), "Lead stage updated.");
  const setAppointmentStatus = (id: string, status: string, message: string) => run(`appt-${id}`, () => api(`/api/appointments/${id}`, { method: "PATCH", body: { status } }), message);
  const loadSample = () => run("seed", () => api("/api/seed", { method: "POST" }), "Sample inventory loaded. It's now live on your website.");

  function exportData() {
    const slug = data.settings.dealership.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const base = data.settings.currency;
    if (section === "inventory") exportCsv(`${slug}-inventory.csv`, [["Stock", "Make", "Model", "Year", "Price", "Currency", "Mileage (km)", "Status", "Published"], ...vehicleRows.map((v) => [v.stock, v.make, v.model, v.year, v.price, base, v.mileage, v.status, v.published ? "Yes" : "No"])]);
    else if (section === "leads" || section === "customers") exportCsv(`${slug}-${section}.csv`, [["Name", "Email", "Phone", "Vehicle", "Stage", "Source", "Created"], ...(section === "leads" ? leadRows : customers).map((l) => [l.name, l.email, l.phone, vehicleName(l.vehicleId), l.stage, l.source, l.created])]);
    else if (section === "appointments") exportCsv(`${slug}-appointments.csv`, [["Customer", "Email", "Phone", "Vehicle", "Date", "Time", "Type", "Status", "Source"], ...appointmentRows.map((a) => [a.customer, a.email, a.phone, vehicleName(a.vehicleId), a.date, a.time, a.type, a.status, a.source])]);
    else exportCsv(`${slug}-sales.csv`, [["Date", "Customer", "Vehicle", "Amount", "Currency", "Payment"], ...saleRows.map((s) => [s.date, s.customer, vehicleName(s.vehicleId), s.amount, base, s.payment])]);
    setToast("Your CSV export is ready.");
  }

  const primaryAction: Partial<Record<Section, [MessageKey, Editor]>> = {
    dashboard: ["action.addVehicle", { kind: "vehicle" }], inventory: ["action.addVehicle", { kind: "vehicle" }], leads: ["action.addLead", { kind: "lead" }],
    customers: ["action.addCustomer", { kind: "lead" }], sales: ["action.recordSale", { kind: "sale" }], appointments: ["action.newAppointment", { kind: "appointment" }],
  };
  const action = primaryAction[section];
  const toolbar = (placeholder: string, filters?: readonly string[]) => (
    <div className="records-toolbar">
      <div className="record-search"><Search size={16} /><input aria-label={placeholder} placeholder={placeholder} value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} /></div>
      <div className="toolbar-right">
        {filters && <label className="filter-select"><SlidersHorizontal size={14} /><select aria-label="Filter by status" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>{["All", ...filters].map((f) => <option key={f} value={f}>{f === "All" ? "All statuses" : f}</option>)}</select></label>}
        {section === "inventory" && <>
          <select className="sort-select" aria-label="Sort vehicles" value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Recently added</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select>
          <div className="view-toggle"><button className={layout === "grid" ? "selected" : ""} aria-label="Grid view" onClick={() => setLayout("grid")}><LayoutGrid size={16} /></button><button className={layout === "list" ? "selected" : ""} aria-label="List view" onClick={() => setLayout("list")}><List size={17} /></button></div>
        </>}
      </div>
    </div>
  );
  const stats = [
    { label: "Revenue this month", value: money(revenue), icon: Wallet, detail: "vs last month", trend: priorRevenue ? `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%` : "New period", positive: growth >= 0, link: "/admin/sales" },
    { label: "Vehicles in stock", value: String(data.vehicles.filter((v) => v.status !== "Sold").length).padStart(2, "0"), icon: CarFront, detail: `${data.vehicles.filter((v) => v.status === "Available" && v.published).length} live on the website`, trend: "In stock", positive: true, link: "/admin/inventory" },
    { label: "Active leads", value: String(activeLeads.length).padStart(2, "0"), icon: UsersRound, detail: `${data.leads.filter((l) => l.stage === "New").length} new enquiries to follow up`, trend: "Pipeline", positive: true, link: "/admin/leads" },
    { label: "Unread messages", value: String(data.unreadMessages).padStart(2, "0"), icon: MessagesSquare, detail: `${requested.length} test-drive requests waiting`, trend: "Inbox", positive: true, link: "/messages" },
  ];
  const hasLiveInventory = data.vehicles.some((v) => v.status !== "Sold");
  const sampleButton = isAdmin && !data.vehicles.length && <button className="secondary-button" disabled={busy === "seed"} onClick={() => void loadSample()}>{busy === "seed" ? <Loader2 size={15} className="spin" /> : <DatabaseZap size={15} />}{t("action.loadSample")}</button>;

  return <div className="portal-content">
    <div className="page-heading">
      <div><div className="eyebrow">{section === "dashboard" ? <><span className="eyebrow-line" /> YOUR BUSINESS, AT A GLANCE</> : data.settings.dealership.toUpperCase()}</div><h1>{t(`title.${section}` as MessageKey)}{section === "dashboard" && <span className="heading-dot">.</span>}</h1><p>{t(`sub.${section}` as MessageKey)}</p></div>
      <div className="heading-actions"><button className="secondary-button" onClick={exportData}><ArrowDownToLine size={16} />{section === "dashboard" || section === "reports" ? t("action.exportReport") : t("action.export")}</button>{action && <button className="primary-button" onClick={() => setEditor(action[1])}><Plus size={17} />{t(action[0])}</button>}</div>
    </div>

    {(section === "dashboard" || section === "reports") && <>
      {section === "dashboard" && <div className="welcome-strip"><div><span className="welcome-icon"><Sparkles size={18} /></span><span><strong>Good to see you, {data.me.name.split(" ")[0]}.</strong><span>You have <b>{todayAppointments.length} appointments</b> today{requested.length ? <>, <b>{requested.length} requests</b> to confirm</> : null} and <b>{data.unreadMessages} unread messages</b>.</span></span></div><Link href={data.unreadMessages ? "/messages" : "/admin/appointments"}>{data.unreadMessages ? "Open inbox" : "View schedule"} <ArrowRight size={16} /></Link></div>}
      <div className="stats-grid">{stats.map(({ label, value, icon: Icon, detail, trend, positive, link }) => <Link href={link} key={label} className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={18} strokeWidth={1.6} /></span></div><strong className="stat-value">{value}</strong><div className="stat-bottom"><span className={`stat-trend ${positive ? "" : "negative"}`}>{label === "Revenue this month" && (positive ? <TrendingUp size={12} /> : <ArrowDown size={12} />)}{trend}</span><small>{detail}</small></div></Link>)}</div>
      <div className="chart-grid"><RevenueChart data={data} money={money} locale={locale} months={months} setMonths={setMonths} /><InventorySummary data={data} /></div>
    </>}

    {section === "dashboard" && <>
      <section className="recent-inventory">
        <div className="section-heading"><div><h2>Recently added vehicles <span>{data.vehicles.filter((v) => v.status !== "Sold").length}</span></h2><p>Fresh arrivals. Ready for their next chapter.</p></div><Link className="text-link" href="/admin/inventory">View inventory <ArrowUpRight size={15} /></Link></div>
        <div className="vehicle-grid">{data.vehicles.filter((v) => v.status !== "Sold").sort((a, b) => b.added.localeCompare(a.added)).slice(0, 4).map((v) => <VehicleCard vehicle={v} money={money} key={v.id} onEdit={() => setEditor({ kind: "vehicle", record: v })} />)}</div>
        {!hasLiveInventory && <Empty title="Your showroom is empty" text="Add a vehicle to publish it on your website.">{sampleButton}</Empty>}
      </section>
      <div className="bottom-grid">
        <section className="dealer-panel leads-preview"><PanelHeading title="Recent enquiries" subtitle="New connections. New possibilities." href="/admin/leads" /><div className="table-scroll"><table><thead><tr><th>Customer</th><th>Interested in</th><th>Status</th><th /></tr></thead><tbody>{data.leads.slice(0, 5).map((l, i) => <tr key={l.id}><td><div className="customer-cell"><span className={`person-avatar avatar-${i % 4}`}>{initials(l.name)}</span><span><strong>{l.name}</strong><small>{l.source}</small></span></div></td><td>{vehicleName(l.vehicleId)}</td><td><Badge value={l.stage} /></td><td>{l.conversationId ? <Link className="icon-button" aria-label={`Open conversation with ${l.name}`} href={`/messages?c=${l.conversationId}`}><MessagesSquare size={16} /></Link> : <button className="icon-button" aria-label={`Edit ${l.name}`} onClick={() => setEditor({ kind: "lead", record: l })}><ArrowUpRight size={16} /></button>}</td></tr>)}</tbody></table></div>{!data.leads.length && <Empty title="No enquiries yet" text="Enquiries from your website will appear here." />}</section>
        <section className="dealer-panel appointments-preview"><PanelHeading title="Today's appointments" subtitle={new Date().toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" })} href="/admin/appointments" action="Schedule" /><div className="appointment-list">{todayAppointments.slice(0, 3).map((a, i) => <button className="appointment-item" key={a.id} onClick={() => setEditor({ kind: "appointment", record: a })}><div className={`appointment-time time-${i}`}><strong>{a.time}</strong><small>{displayDate(a.date).split(",")[0]}</small></div><span><strong>{a.customer}</strong><small>{a.type} <span>·</span> {vehicleName(a.vehicleId)}</small></span><ChevronRight size={15} /></button>)}{!todayAppointments.length && <Empty title="A little breathing room" text="No appointments scheduled for today." />}</div><Link href="/admin/appointments" className="schedule-link"><Plus size={14} /> Manage your schedule</Link></section>
      </div>
    </>}

    {section === "inventory" && <>
      <div className="inventory-tabs">
        {["All", "Available", "Reserved", "Sold"].map((status) => (
          <button key={status} className={filter === status ? "active" : ""} onClick={() => { setFilter(status); setPage(1); }}>
            {status === "All" ? "All vehicles" : status}
            <span>{data.vehicles.filter((v) => status === "All" || v.status === status).length}</span>
          </button>
        ))}
      </div>
      {toolbar("Search by make, model or stock number...")}
      <div className={layout === "grid" ? "vehicle-grid inventory-grid" : "vehicle-list"}>
        {vehicleRows.slice((visiblePage - 1) * 8, visiblePage * 8).map((v) => (
          <div key={v.id} className="inventory-card-wrap">
            <VehicleCard vehicle={v} money={money} onEdit={() => setEditor({ kind: "vehicle", record: v })} />
            <div className="inventory-card-actions">
              <button onClick={() => setEditor({ kind: "vehicle", record: v })}><Pencil size={14} />Edit</button>
              {v.status !== "Sold" && <button onClick={() => setEditor({ kind: "sale", vehicleId: v.id })}><CircleDollarSign size={14} />Record sale</button>}
              {v.published && v.status !== "Sold" && <a href={`${process.env.NEXT_PUBLIC_CLIENT_URL || "http://localhost:3000"}/inventory/${v.slug}`} target="_blank" rel="noreferrer"><ArrowUpRight size={14} />View</a>}
              <button className="delete-action" aria-label={`Delete ${vehicleTitle(v)}`} onClick={() => setDeleteTarget(v)}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
      {!vehicleRows.length && <Empty title={data.vehicles.length ? "No records found" : "Your showroom is empty"} text={data.vehicles.length ? "Try another search or filter." : "Add your first vehicle to publish it on your website."}>{sampleButton}</Empty>}
      <div className="pagination">
        <span>{vehicleRows.length} vehicles{query && <> matching &ldquo;{query}&rdquo; <button onClick={() => { setQuery(""); setPage(1); }}>Clear</button></>}</span>
        <div>
          <button disabled={visiblePage === 1} onClick={() => setPage(visiblePage - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
          <span>Page {visiblePage} of {pages}</span>
          <button disabled={visiblePage >= pages} onClick={() => setPage(visiblePage + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
        </div>
      </div>
    </>}

    {section === "leads" && <>
      <div className="pipeline-summary">
        {LEAD_STAGES.map((stage) => <button className={filter === stage ? "active" : ""} key={stage} onClick={() => setFilter(filter === stage ? "All" : stage)}><span>{stage}</span><strong>{data.leads.filter((l) => l.stage === stage).length}</strong></button>)}
      </div>
      <section className="dealer-panel">
        {toolbar("Search customers or vehicles...", LEAD_STAGES)}
        <div className="table-scroll">
          <table>
            <thead><tr><th>Customer</th><th>Vehicle of interest</th><th>Source</th><th>Pipeline stage</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              {leadRows.map((l, i) => <tr key={l.id}>
                <td><div className="customer-cell"><span className={`person-avatar avatar-${i % 4}`}>{initials(l.name)}</span><span><strong>{l.name}</strong><small>{l.email}</small></span></div></td>
                <td>{vehicleName(l.vehicleId)}</td><td>{l.source}</td>
                <td>
                  <select className="stage-select" aria-label={`Stage for ${l.name}`} value={l.stage} disabled={l.stage === "Won" || busy === `lead-${l.id}`} onChange={(e) => void changeLeadStage(l.id, e.target.value)}>
                    {LEAD_STAGES.map((s) => <option key={s} value={s} disabled={s === "Won"}>{s}</option>)}
                  </select>
                </td>
                <td>{displayDate(l.created)}</td>
                <td><div className="table-actions">
                  {l.conversationId && <Link className="icon-button" aria-label={`Open conversation with ${l.name}`} title="Open conversation" href={`/messages?c=${l.conversationId}`}><MessagesSquare size={15} /></Link>}
                  <button className="icon-button" aria-label={`Edit ${l.name}`} onClick={() => setEditor({ kind: "lead", record: l })}><Pencil size={15} /></button>
                  {!["Won", "Lost"].includes(l.stage) && <button className="small-button" onClick={() => setEditor({ kind: "sale", vehicleId: l.vehicleId, leadId: l.id })}>Record sale<ArrowUpRight size={13} /></button>}
                </div></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {!leadRows.length && <Empty />}
        <div className="table-note">{leadRows.length} enquiries <span>Record a sale to mark a lead as won.</span></div>
      </section>
    </>}

    {section === "sales" && <>
      <div className="mini-stats">
        <div><span>Total sales revenue</span><strong>{money(data.sales.reduce((sum, s) => sum + s.amount, 0))}</strong></div>
        <div><span>Completed transactions</span><strong>{data.sales.length}</strong></div>
        <div><span>Average deal value</span><strong>{money(data.sales.length ? data.sales.reduce((sum, s) => sum + s.amount, 0) / data.sales.length : 0)}</strong></div>
      </div>
      <section className="dealer-panel">
        {toolbar("Search transactions...")}
        <div className="table-scroll">
          <table>
            <thead><tr><th>Transaction</th><th>Vehicle</th><th>Customer</th><th>Sale date</th><th>Payment</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {saleRows.map((s) => <tr key={s.id}>
                <td><span className="transaction-id">#MMC-{s.id.slice(-8).toUpperCase()}</span></td>
                <td><strong>{vehicleName(s.vehicleId)}</strong></td><td>{s.customer}</td>
                <td>{displayDate(s.date)}</td><td>{s.payment}</td>
                <td><strong>{money(s.amount)}</strong></td><td><Badge value="Paid" /></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {!saleRows.length && <Empty />}
        <div className="table-note">{saleRows.length} completed sales <span>Amounts are stored in {data.settings.currency}. Payments are settled outside the portal.</span></div>
      </section>
    </>}

    {section === "appointments" && <section className="dealer-panel">
      {requested.length > 0 && <div className="request-banner"><CalendarCheck size={18} /><span><strong>{requested.length} website {requested.length === 1 ? "request" : "requests"}</strong> waiting for confirmation.</span></div>}
      <div className="schedule-toolbar">
        <div className="schedule-date"><CalendarDays size={19} /><input aria-label="Appointment date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setAppointmentScope("day"); }} /></div>
        <div className="inventory-tabs compact-tabs">
          <button className={appointmentScope === "upcoming" ? "active" : ""} onClick={() => setAppointmentScope("upcoming")}>Upcoming</button>
          <button className={appointmentScope === "day" ? "active" : ""} onClick={() => setAppointmentScope("day")}>Selected day</button>
          <button className={appointmentScope === "all" ? "active" : ""} onClick={() => setAppointmentScope("all")}>All</button>
        </div>
      </div>
      {toolbar("Search appointments...")}
      <div className="table-scroll"><table>
        <thead><tr><th>Time & date</th><th>Customer</th><th>Vehicle</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{appointmentRows.map((a) => {
          const working = busy === `appt-${a.id}`;
          const open = a.status === "Scheduled" || a.status === "Requested";
          return <tr key={a.id}>
            <td><div className="stacked-cell"><strong>{timeLabel(a.time)}</strong><small>{displayDate(a.date)}</small></div></td>
            <td><div className="stacked-cell"><strong>{a.customer}</strong><small>{a.phone || a.email || (a.source === "website" ? "Website booking" : "")}</small></div></td>
            <td>{vehicleName(a.vehicleId)}</td><td>{a.type}</td><td><Badge value={a.status} /></td>
            <td><div className="table-actions">{open && <>
              {a.status === "Requested" && <button className="small-button" disabled={working} onClick={() => void setAppointmentStatus(a.id, "Scheduled", "Appointment confirmed.")}><Check size={13} />Confirm</button>}
              <button className="icon-button" aria-label={`Edit appointment for ${a.customer}`} onClick={() => setEditor({ kind: "appointment", record: a })}><Pencil size={15} /></button>
              {a.status === "Scheduled" && <button className="icon-button" disabled={working} aria-label={`Complete appointment for ${a.customer}`} onClick={() => void setAppointmentStatus(a.id, "Completed", "Appointment marked complete.")}><Check size={17} /></button>}
              <button className="icon-button delete-action" disabled={working} aria-label={`Cancel appointment for ${a.customer}`} onClick={() => void setAppointmentStatus(a.id, "Cancelled", "Appointment cancelled.")}><X size={16} /></button>
            </>}</div></td>
          </tr>;
        })}</tbody>
      </table></div>
      {!appointmentRows.length && <Empty title="Nothing on the calendar" text="Schedule a test drive, delivery or consultation to get started." />}
    </section>}

    {section === "customers" && <section className="dealer-panel">
      {toolbar("Search by name, email or phone...")}
      <div className="table-scroll"><table>
        <thead><tr><th>Customer</th><th>Phone</th><th>Interested in</th><th>Relationship</th><th>Customer since</th><th /></tr></thead>
        <tbody>{customers.map((l, i) => <tr key={l.email}>
          <td><div className="customer-cell"><span className={`person-avatar avatar-${i % 4}`}>{initials(l.name)}</span><span><strong>{l.name}</strong><a href={`mailto:${l.email}`}>{l.email}</a></span></div></td>
          <td>{l.phone ? <a href={`tel:${l.phone}`}>{l.phone}</a> : "—"}</td><td>{vehicleName(l.vehicleId)}</td><td><Badge value={l.stage} /></td><td>{displayDate(l.created)}</td>
          <td><button className="icon-button" aria-label={`Edit ${l.name}`} onClick={() => setEditor({ kind: "lead", record: l })}><Pencil size={15} /></button></td>
        </tr>)}</tbody>
      </table></div>
      {!customers.length && <Empty />}
      <div className="table-note">{customers.length} unique customers <span>Customer records are linked to your lead pipeline.</span></div>
    </section>}

    {section === "reports" && <div className="reports-grid">
      <section className="dealer-panel"><PanelHeading title="Lead sources" subtitle="Understand where your customers find you" /><div className="source-bars">{LEAD_SOURCES.map((source) => { const count = data.leads.filter((l) => l.source === source).length; return <div key={source}><div><span>{source}</span><strong>{count} leads</strong></div><div className="bar-track"><span style={{ width: `${count / (data.leads.length || 1) * 100}%` }} /></div></div>; })}</div></section>
      <section className="dealer-panel"><PanelHeading title="Sales snapshot" subtitle="Based on all completed transactions" /><div className="report-metrics"><div><span>Lead conversion</span><strong>{Math.round(data.leads.filter((l) => l.stage === "Won").length / (data.leads.length || 1) * 100)}%</strong></div><div><span>Inventory asking value (unsold)</span><strong>{money(data.vehicles.filter((v) => v.status !== "Sold").reduce((sum, v) => sum + v.price, 0))}</strong></div><div><span>Total realized revenue</span><strong>{money(data.sales.reduce((sum, s) => sum + s.amount, 0))}</strong></div></div></section>
    </div>}

    {editor && <RecordForm key={`${editor.kind}-${"record" in editor ? editor.record?.id ?? "new" : "new"}`} editor={editor} data={data} onClose={() => setEditor(null)} onSaved={setToast} />}
    <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
      <DialogContent className="dealer-dialog">
        <DialogTitle>Delete this vehicle?</DialogTitle>
        <DialogDescription>{deleteTarget && `${deleteTarget.year} ${vehicleTitle(deleteTarget)}`} will be permanently removed from your inventory and website. Vehicles linked to leads, appointments or sales can&apos;t be deleted &mdash; unpublish them instead.</DialogDescription>
        <div className="dialog-actions">
          <button className="secondary-button" onClick={() => setDeleteTarget(null)}>Keep vehicle</button>
          <button className="danger-button" disabled={busy === "delete"} onClick={() => { const target = deleteTarget!; setDeleteTarget(null); void run("delete", () => api(`/api/vehicles/${target.id}`, { method: "DELETE" }), "Vehicle deleted."); }}><Trash2 size={15} />Delete vehicle</button>
        </div>
      </DialogContent>
    </Dialog>
    {toast && <div className={`dealer-toast ${toast.startsWith("Error:") ? "error-toast" : ""}`} role="status">{toast.startsWith("Error:") ? <X size={18} /> : <Check size={18} />}<span>{toast.replace(/^Error: /, "")}</span><button className="icon-button" aria-label="Dismiss message" onClick={() => setToast("")}><X size={15} /></button></div>}
  </div>;
}
