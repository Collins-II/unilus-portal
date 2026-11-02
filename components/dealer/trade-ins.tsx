"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRightLeft, CarFront, Check, ExternalLink, HandCoins, Loader2, Mail, MessagesSquare, Phone, RefreshCw, Save, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { TRADE_IN_STATUSES, initials, vehicleTitle, type TradeIn, type Vehicle, type WorkspaceData } from "@/lib/domain";
import { api, errorMessage, exportCsv } from "@/lib/client/api";
import { isOptimizedImage } from "@/lib/images";
import { useMoney, usePreferences } from "@/lib/client/preferences";
import { refreshWorkspace, useWorkspace } from "@/lib/client/workspace";

type Money = ReturnType<typeof useMoney>;

const STATUS_COLOR: Record<TradeIn["status"], string> = {
  New: "blue", Reviewing: "amber", "Offer made": "amber", Accepted: "green", Completed: "green", Declined: "gray",
};
const Badge = ({ value }: { value: TradeIn["status"] }) => <span className={`status-badge ${STATUS_COLOR[value]}`}><i />{value}</span>;

export function TradeIns() {
  const { data } = useWorkspace();
  if (!data) return null;
  return <TradeInsView data={data} />;
}

function TradeInsView({ data }: { data: WorkspaceData }) {
  const { t, locale } = usePreferences();
  const money = useMoney(data.settings);
  const [items, setItems] = useState<TradeIn[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"All" | TradeIn["type"]>("All");
  const [status, setStatus] = useState("Open");
  const [selected, setSelected] = useState<TradeIn | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(() => api<TradeIn[]>("/api/trade-ins").then(
    (next) => { setItems(next); setLoadError(""); },
    (error) => setLoadError(errorMessage(error)),
  ), []);
  useEffect(() => {
    let cancelled = false;
    api<TradeIn[]>("/api/trade-ins").then(
      (next) => { if (!cancelled) setItems(next); },
      (error) => { if (!cancelled) setLoadError(errorMessage(error)); },
    );
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const vehicles = useMemo(() => new Map(data.vehicles.map((v) => [v.id, v])), [data.vehicles]);
  const term = query.trim().toLowerCase();
  const rows = (items ?? []).filter((item) =>
    (type === "All" || item.type === type)
    && (status === "All" || (status === "Open" ? !["Declined", "Completed"].includes(item.status) : item.status === status))
    && (!term || `${item.name} ${item.email} ${item.phone} ${item.make} ${item.model} ${item.year}`.toLowerCase().includes(term)));
  const displayDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });

  function onChanged(next: TradeIn, message: string) {
    setItems((current) => current?.map((item) => (item.id === next.id ? next : item)) ?? null);
    setSelected(next);
    setToast(message);
    void refreshWorkspace();
  }
  function onDeleted(id: string) {
    setItems((current) => current?.filter((item) => item.id !== id) ?? null);
    setSelected(null);
    setToast("Request deleted.");
    void refreshWorkspace();
  }

  function exportData() {
    exportCsv("trade-ins.csv", [
      ["Created", "Type", "Status", "Customer", "Email", "Phone", "Year", "Make", "Model", "Mileage (km)", "Condition", "Asking", "Offer", "Swap for", "Photos"],
      ...rows.map((r) => [r.created, r.type, r.status, r.name, r.email, r.phone, r.year, r.make, r.model, r.mileage, r.condition, r.askingPrice, r.offer, targetName(vehicles.get(r.targetVehicleId)), r.images.length]),
    ]);
  }

  const counts = { sell: (items ?? []).filter((i) => i.type === "Sell" && i.status === "New").length, swap: (items ?? []).filter((i) => i.type === "Swap" && i.status === "New").length };

  return <div className="portal-content">
    <div className="page-heading">
      <div><div className="eyebrow">{data.settings.dealership.toUpperCase()}</div><h1>{t("title.tradeIns")}</h1><p>{t("sub.tradeIns")}</p></div>
      <div className="heading-actions">
        <button className="secondary-button" onClick={() => void load()}><RefreshCw size={15} />Refresh</button>
        <button className="secondary-button" onClick={exportData} disabled={!rows.length}>{t("action.export")}</button>
      </div>
    </div>

    <div className="stats-grid">
      <button className="stat-card" onClick={() => { setType("Sell"); setStatus("New"); }}><div className="stat-top"><span>New sell requests</span><span className="stat-icon"><HandCoins size={18} strokeWidth={1.6} /></span></div><strong className="stat-value">{String(counts.sell).padStart(2, "0")}</strong><div className="stat-bottom"><small>Customers offering their car to you</small></div></button>
      <button className="stat-card" onClick={() => { setType("Swap"); setStatus("New"); }}><div className="stat-top"><span>New swap & top-up requests</span><span className="stat-icon"><ArrowRightLeft size={18} strokeWidth={1.6} /></span></div><strong className="stat-value">{String(counts.swap).padStart(2, "0")}</strong><div className="stat-bottom"><small>Trade-ins against your stock</small></div></button>
    </div>

    <section className="dealer-panel">
      <div className="records-toolbar">
        <div className="record-search"><Search size={16} /><input aria-label="Search requests" placeholder="Search by customer or car" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <div className="toolbar-right">
          <label className="filter-select"><SlidersHorizontal size={14} /><select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value as typeof type)}><option value="All">Sell & swap</option><option value="Sell">Sell to us</option><option value="Swap">Swap & top-up</option></select></label>
          <label className="filter-select"><SlidersHorizontal size={14} /><select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="Open">Open requests</option><option value="All">All statuses</option>{TRADE_IN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        </div>
      </div>
      {loadError && <div className="form-error" role="alert">{loadError}</div>}
      {!items && !loadError && <div className="empty-state"><Loader2 size={24} className="spin" /><p>Loading requests…</p></div>}
      {items && <div className="table-scroll"><table>
        <thead><tr><th>Car</th><th>Customer</th><th>Request</th><th>Asking</th><th>Offer</th><th>Status</th><th>Received</th></tr></thead>
        <tbody>{rows.map((item) => (
          <tr key={item.id} onClick={() => setSelected(item)} style={{ cursor: "pointer" }}>
            <td><div className="customer-cell"><span className="image-thumb" style={{ width: 64, height: 46 }}>{item.images[0] ? <Image src={item.images[0]} alt="" fill sizes="64px" unoptimized={!isOptimizedImage(item.images[0])} /> : <CarFront size={18} />}</span><span><strong>{item.year} {item.make} {item.model}</strong><small>{item.mileage.toLocaleString(locale)} km · {item.images.length} photo{item.images.length === 1 ? "" : "s"}</small></span></div></td>
            <td><div className="customer-cell"><span className="person-avatar avatar-1">{initials(item.name)}</span><span><strong>{item.name}</strong><small>{item.phone || item.email}</small></span></div></td>
            <td>{item.type === "Sell" ? "Sell to us" : <>Swap{vehicles.get(item.targetVehicleId) ? <small style={{ display: "block" }}>for {targetName(vehicles.get(item.targetVehicleId))}</small> : null}</>}</td>
            <td>{item.askingPrice ? money(item.askingPrice) : "—"}</td>
            <td>{item.offer ? money(item.offer) : "—"}</td>
            <td><Badge value={item.status} /></td>
            <td>{displayDate(item.created)}</td>
          </tr>
        ))}</tbody>
      </table></div>}
      {items && !rows.length && <div className="empty-state"><Search size={27} /><h3>{items.length ? "No matching requests" : "No requests yet"}</h3><p>{items.length ? "Try another search or filter." : "When customers offer to sell or swap their car on your website, their request and photos appear here."}</p></div>}
    </section>

    {selected && <TradeInDialog key={selected.id} item={selected} data={data} money={money} target={vehicles.get(selected.targetVehicleId)} inventory={vehicles.get(selected.vehicleId)} onClose={() => setSelected(null)} onChanged={onChanged} onDeleted={onDeleted} />}
    {toast && <div className="dealer-toast" role="status"><Check size={18} /><span>{toast}</span><button className="icon-button" aria-label="Dismiss message" onClick={() => setToast("")}><X size={15} /></button></div>}
  </div>;
}

const targetName = (vehicle?: Vehicle) => (vehicle ? `${vehicle.year} ${vehicleTitle(vehicle)}` : "");

function TradeInDialog({ item, data, money, target, inventory, onClose, onChanged, onDeleted }: {
  item: TradeIn; data: WorkspaceData; money: Money; target?: Vehicle; inventory?: Vehicle;
  onClose: () => void; onChanged: (next: TradeIn, message: string) => void; onDeleted: (id: string) => void;
}) {
  const [photo, setPhoto] = useState(0);
  const [status, setStatus] = useState(item.status);
  const [offer, setOffer] = useState(item.offer ? String(item.offer) : "");
  const [notes, setNotes] = useState(item.staffNotes);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const value = Number(offer) || item.askingPrice;
  const topUp = target && value ? Math.max(0, target.price - value) : 0;
  const canAddToInventory = !inventory && ["Accepted", "Completed"].includes(status) && status === item.status;

  async function run(kind: string, request: () => Promise<void>) {
    setBusy(kind);
    setError("");
    try {
      await request();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  }
  const save = () => run("save", async () => {
    const next = await api<TradeIn>(`/api/trade-ins/${item.id}`, { method: "PATCH", body: { status, offer: offer === "" ? 0 : Number(offer), staffNotes: notes } });
    onChanged(next, "Request updated.");
  });
  const addToInventory = () => run("inventory", async () => {
    const result = await api<{ tradeIn: TradeIn; vehicle: Vehicle }>(`/api/trade-ins/${item.id}/inventory`, { method: "POST", body: {} });
    onChanged(result.tradeIn, `Added to inventory as ${result.vehicle.stock} (hidden until you publish it).`);
  });
  const remove = () => run("delete", async () => {
    if (!window.confirm("Delete this request? The conversation with the customer is kept.")) return;
    await api(`/api/trade-ins/${item.id}`, { method: "DELETE" });
    onDeleted(item.id);
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="dealer-dialog record-dialog">
        <DialogTitle>{item.type === "Sell" ? "Sell to us" : "Swap & top-up"}: {item.year} {item.make} {item.model}</DialogTitle>
        <DialogDescription>Received {item.created} from {item.name}. <Badge value={item.status} /></DialogDescription>

        {item.images.length > 0 && <div className="image-manager">
          <a href={item.images[photo]} target="_blank" rel="noreferrer" className="image-thumb" style={{ width: "100%", height: 280 }} title="Open full-size photo">
            <Image src={item.images[photo]} alt={`Photo ${photo + 1} of ${item.images.length}`} fill sizes="640px" unoptimized={!isOptimizedImage(item.images[photo])} />
          </a>
          {item.images.length > 1 && <div className="image-strip">{item.images.map((src, index) => (
            <button key={`${src}-${index}`} type="button" className="image-thumb" style={{ width: 72, height: 52, outline: index === photo ? "2px solid currentColor" : undefined }} onClick={() => setPhoto(index)} aria-label={`Show photo ${index + 1}`}>
              <Image src={src} alt="" fill sizes="72px" unoptimized={!isOptimizedImage(src)} />
            </button>
          ))}</div>}
        </div>}

        <div className="record-fields">
          <Detail label="Customer" value={item.name} />
          <div className="form-field"><span>Contact</span><span style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
            {item.phone && <a href={`tel:${item.phone.replace(/[^\d+]/g, "")}`}><Phone size={12} /> {item.phone}</a>}
            <a href={`mailto:${item.email}`}><Mail size={12} /> {item.email}</a>
          </span></div>
          <Detail label="Mileage" value={`${item.mileage.toLocaleString()} km`} />
          <Detail label="Condition" value={item.condition} />
          <Detail label="Specification" value={`${item.body} · ${item.fuel} · ${item.transmission}${item.color ? ` · ${item.color}` : ""}`} />
          <Detail label={item.type === "Sell" ? "Asking price" : "Expected trade-in value"} value={item.askingPrice ? money(item.askingPrice) : "Not given"} />
          {item.type === "Swap" && <Detail label="Wants to swap for" value={target ? `${targetName(target)} · ${money(target.price)}` : item.targetVehicleId ? "Vehicle no longer listed" : "Not chosen yet"} />}
          {item.type === "Swap" && target && <Detail label="Estimated top-up" value={value ? money(topUp) : "Enter an offer"} />}
          {item.notes && <div className="form-field full-width"><span>Customer notes</span><p style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{item.notes}</p></div>}

          <label className="form-field"><span>Status</span><select value={status} onChange={(e) => setStatus(e.target.value as TradeIn["status"])}>{TRADE_IN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label className="form-field"><span>Our offer ({data.settings.currency})</span><input type="number" min="0" step="1" value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="0" /></label>
          <label className="form-field full-width"><span>Internal notes</span><textarea rows={3} maxLength={3000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Inspection notes, valuation, next steps…" /></label>
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="dialog-actions" style={{ flexWrap: "wrap" }}>
          {data.me.role === "admin" && <button type="button" className="secondary-button" onClick={() => void remove()} disabled={!!busy} aria-label="Delete request"><Trash2 size={15} /></button>}
          {item.conversationId && <Link className="secondary-button" href={`/messages?c=${item.conversationId}`}><MessagesSquare size={15} />Message customer</Link>}
          {inventory
            ? <Link className="secondary-button" href={`/admin/inventory?q=${encodeURIComponent(inventory.stock)}`}><ExternalLink size={15} />View in inventory</Link>
            : canAddToInventory && <button type="button" className="secondary-button" onClick={() => void addToInventory()} disabled={!!busy}>{busy === "inventory" ? <Loader2 size={15} className="spin" /> : <CarFront size={15} />}Add to inventory</button>}
          <button type="button" className="primary-button" onClick={() => void save()} disabled={!!busy}>{busy === "save" ? <Loader2 size={16} className="spin" /> : <Save size={16} />}Save changes</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="form-field"><span>{label}</span><strong style={{ fontSize: 12, fontWeight: 500 }}>{value}</strong></div>;
}
