"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImagePlus, Link2, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { APPOINTMENT_TYPES, BODIES, FUELS, LEAD_SOURCES, MAX_VEHICLE_IMAGES, PAYMENT_METHODS, TRANSMISSIONS, localDate, vehicleTitle, type Appointment, type Lead, type Vehicle, type WorkspaceData } from "@/lib/domain";
import { api, errorMessage } from "@/lib/client/api";
import { mapWithConcurrency, prepareImage } from "@/lib/client/image-upload";
import { isOptimizedImage } from "@/lib/images";
import { mutate } from "@/lib/client/workspace";

export type Editor =
  | { kind: "vehicle"; record?: Vehicle }
  | { kind: "lead"; record?: Lead }
  | { kind: "appointment"; record?: Appointment }
  | { kind: "sale"; vehicleId?: string; leadId?: string };

type FieldProps = { label: string; name: string; value?: string | number; type?: string; required?: boolean; min?: string | number; max?: string | number; step?: string | number; placeholder?: string; children?: React.ReactNode };

export function Field({ label, name, value, type = "text", required = true, min, max, step, placeholder, children }: FieldProps) {
  return (
    <label className="form-field">
      <span>{label}{required && <i> *</i>}</span>
      {children
        ? <select name={name} defaultValue={value} required={required}>{children}</select>
        : <input name={name} type={type} defaultValue={value} required={required} min={min} max={max} step={step} placeholder={placeholder} />}
    </label>
  );
}

const options = (values: readonly string[]) => values.map((v) => <option key={v} value={v}>{v}</option>);
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

function ImageManager({ images, setImages, onError }: { images: string[]; setImages: React.Dispatch<React.SetStateAction<string[]>>; onError: (message: string) => void }) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [url, setUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const uploading = progress !== null;

  async function upload(list: FileList | File[] | null) {
    const all = Array.from(list ?? []);
    if (!all.length || uploading) return;
    const files = all.filter((file) => ACCEPTED.includes(file.type));
    const room = MAX_VEHICLE_IMAGES - images.length;
    const queue = files.slice(0, room);
    const problems: string[] = [];
    if (files.length < all.length) problems.push(`${all.length - files.length} file(s) skipped: only JPEG, PNG, WebP or AVIF images are allowed.`);
    if (files.length > room) problems.push(`Only ${MAX_VEHICLE_IMAGES} photos are allowed per vehicle; ${files.length - room} were not added.`);
    if (!queue.length) {
      onError(problems.join(" ") || "No photos were added.");
      return;
    }
    setProgress({ done: 0, total: queue.length });
    try {
      const results = await mapWithConcurrency(queue, 3, async (file) => {
        const form = new FormData();
        form.append("file", await prepareImage(file));
        const { url: uploaded } = await api<{ url: string }>("/api/upload", { form });
        setProgress((current) => current && { ...current, done: current.done + 1 });
        return uploaded;
      });
      const added = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
      const failed = results.length - added.length;
      if (added.length) setImages((current) => [...current, ...added].slice(0, MAX_VEHICLE_IMAGES));
      if (failed) {
        const reason = results.find((result): result is PromiseRejectedResult => result.status === "rejected")?.reason;
        problems.push(`${failed} of ${queue.length} photo(s) failed to upload: ${errorMessage(reason)}`);
      }
      if (problems.length) onError(problems.join(" "));
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  function addUrl() {
    const value = url.trim();
    if (!/^https:\/\/\S+$/.test(value)) return onError("Image links must start with https://");
    if (images.length >= MAX_VEHICLE_IMAGES) return onError(`Only ${MAX_VEHICLE_IMAGES} photos are allowed per vehicle.`);
    setImages((current) => [...current, value]);
    setUrl("");
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= images.length || from === to) return;
    setImages((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  return (
    <div
      className={`full-width image-manager ${dragging ? "is-dragging" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); } }}
    >
      <span className="image-manager-label">Photos ({images.length}/{MAX_VEHICLE_IMAGES}) <small>Select or drop several photos at once. Drag thumbnails to reorder; the first photo is the cover on the website.</small></span>
      <div className="image-strip">
        {images.map((src, index) => (
          <div
            key={`${src}-${index}`}
            className={`image-thumb ${dragIndex === index ? "is-moving" : ""}`}
            draggable
            onDragStart={(e) => { setDragIndex(index); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { if (dragIndex !== null) e.preventDefault(); }}
            onDrop={(e) => { if (dragIndex !== null) { e.preventDefault(); e.stopPropagation(); move(dragIndex, index); setDragIndex(null); } }}
            onDragEnd={() => setDragIndex(null)}
          >
            <Image src={src} alt={`Vehicle photo ${index + 1}`} fill sizes="120px" unoptimized={!isOptimizedImage(src)} draggable={false} />
            {index === 0 && <span className="cover-tag">Cover</span>}
            <div className="thumb-actions">
              <span style={{ display: "flex", gap: 3 }}>
                {index > 0 && <button type="button" aria-label="Move photo left" title="Move left" onClick={() => move(index, index - 1)}><ChevronLeft size={13} /></button>}
                {index < images.length - 1 && <button type="button" aria-label="Move photo right" title="Move right" onClick={() => move(index, index + 1)}><ChevronRight size={13} /></button>}
                {index > 0 && <button type="button" onClick={() => move(index, 0)}>Cover</button>}
              </span>
              <button type="button" aria-label="Remove photo" onClick={() => setImages((current) => current.filter((_, i) => i !== index))}><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
        {images.length < MAX_VEHICLE_IMAGES && (
          <button type="button" className="image-add" disabled={uploading} onClick={() => input.current?.click()}>
            {uploading ? <Loader2 size={20} className="spin" /> : <ImagePlus size={20} />}<span>{progress ? `Uploading ${progress.done}/${progress.total}` : "Add photos"}</span>
          </button>
        )}
      </div>
      <input ref={input} type="file" accept={ACCEPTED.join(",")} multiple hidden onChange={(e) => void upload(e.target.files)} />
      <div className="image-url-row">
        <Link2 size={15} />
        <input aria-label="Image URL" placeholder="…or paste an https:// image link" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }} />
        <button type="button" className="small-button" onClick={addUrl} disabled={!url.trim()}>Add</button>
      </div>
    </div>
  );
}

export function RecordForm({ editor, data, onClose, onSaved }: { editor: Editor; data: WorkspaceData; onClose: () => void; onSaved: (message: string) => void }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const vehicle = editor.kind === "vehicle" ? editor.record : undefined;
  const lead = editor.kind === "lead" ? editor.record : undefined;
  const appointment = editor.kind === "appointment" ? editor.record : undefined;
  const record = vehicle ?? lead ?? appointment;
  const [images, setImages] = useState<string[]>(vehicle?.images ?? []);
  const available = data.vehicles.filter((v) => v.status !== "Sold" || v.id === lead?.vehicleId || v.id === appointment?.vehicleId);
  const forSale = data.vehicles.filter((v) => v.status !== "Sold");
  const [saleVehicleId, setSaleVehicleId] = useState(editor.kind === "sale" ? editor.vehicleId ?? forSale[0]?.id ?? "" : "");
  const currency = data.settings.currency;
  const noun = { vehicle: "vehicle", lead: "lead", appointment: "appointment", sale: "a sale" }[editor.kind];
  const title = `${record ? "Edit" : editor.kind === "sale" ? "Record" : "Add"} ${noun}`;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const checked = (key: string) => form.get(key) === "on";
    setSaving(true);
    setError("");
    try {
      await mutate(async () => {
        if (editor.kind === "vehicle") {
          const body = {
            make: text("make"), model: text("model"), year: text("year"), price: text("price"), mileage: text("mileage"), stock: text("stock"),
            fuel: text("fuel"), transmission: text("transmission"), body: text("body"), color: text("color"), badge: text("badge"),
            status: vehicle?.status === "Sold" ? "Available" : text("status"), description: text("description"), images,
            featured: checked("featured"), published: checked("published"),
          };
          return vehicle ? api(`/api/vehicles/${vehicle.id}`, { method: "PATCH", body }) : api("/api/vehicles", { body });
        }
        if (editor.kind === "lead") {
          const body = { name: text("name"), email: text("email"), phone: text("phone"), source: text("source"), vehicleId: text("vehicleId"), message: text("message") };
          return lead ? api(`/api/leads/${lead.id}`, { method: "PATCH", body }) : api("/api/leads", { body });
        }
        if (editor.kind === "appointment") {
          const body = { customer: text("customer"), email: text("email"), phone: text("phone"), type: text("type"), date: text("date"), time: text("time"), vehicleId: text("vehicleId"), notes: text("notes") };
          return appointment ? api(`/api/appointments/${appointment.id}`, { method: "PATCH", body }) : api("/api/appointments", { body });
        }
        return api("/api/sales", { body: { vehicleId: saleVehicleId, leadId: text("leadId"), amount: text("amount"), date: text("date"), payment: text("payment") } });
      });
      onSaved(editor.kind === "sale" ? "Sale recorded. The vehicle is now marked sold on the website." : `${noun[0].toUpperCase()}${noun.slice(1)} ${record ? "updated" : "added"}.`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const description = {
    vehicle: "Published vehicles appear on your website as soon as you save.",
    lead: "Track a customer and the vehicle they're interested in.",
    appointment: "Appointments created here are confirmed immediately.",
    sale: "Recording a sale marks the vehicle sold and closes the customer's lead as won.",
  }[editor.kind];

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="dealer-dialog record-dialog">
        <DialogTitle className="capitalize">{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <form onSubmit={submit}>
          <div className="record-fields">
            {editor.kind === "vehicle" && <>
              <Field label="Make" name="make" value={vehicle?.make} placeholder="Toyota" />
              <Field label="Model" name="model" value={vehicle?.model} placeholder="Land Cruiser 300" />
              <Field label="Model year" name="year" type="number" min="1950" max={new Date().getFullYear() + 2} value={vehicle?.year ?? new Date().getFullYear()} />
              <Field label="Stock number" name="stock" value={vehicle?.stock} placeholder="MMC-1042" />
              <Field label={`Asking price (${currency})`} name="price" type="number" min="1" step="0.01" value={vehicle?.price} />
              <Field label="Mileage (km)" name="mileage" type="number" min="0" value={vehicle?.mileage ?? 0} />
              <Field label="Body type" name="body" value={vehicle?.body ?? "SUV"}>{options(BODIES)}</Field>
              <Field label="Fuel type" name="fuel" value={vehicle?.fuel ?? "Petrol"}>{options(FUELS)}</Field>
              <Field label="Transmission" name="transmission" value={vehicle?.transmission ?? "Automatic"}>{options(TRANSMISSIONS)}</Field>
              <Field label="Colour" name="color" value={vehicle?.color} required={false} />
              {vehicle?.status === "Sold"
                ? <label className="form-field"><span>Availability</span><input value="Sold" disabled /></label>
                : <Field label="Availability" name="status" value={vehicle?.status ?? "Available"}>{options(["Available", "Reserved"])}</Field>}
              <Field label="Website badge" name="badge" value={vehicle?.badge} required={false} placeholder="New arrival" />
              <label className="form-field full-width"><span>Description</span><textarea name="description" rows={3} maxLength={3000} defaultValue={vehicle?.description} /></label>
              <ImageManager images={images} setImages={setImages} onError={setError} />
              <label className="check-field"><input type="checkbox" name="published" defaultChecked={vehicle?.published ?? true} /><span><strong>Published</strong><small>Show this vehicle on the website.</small></span></label>
              <label className="check-field"><input type="checkbox" name="featured" defaultChecked={vehicle?.featured ?? false} /><span><strong>Featured</strong><small>Highlight it on the homepage.</small></span></label>
            </>}
            {editor.kind === "lead" && <>
              <Field label="Customer name" name="name" value={lead?.name} />
              <Field label="Email address" name="email" type="email" value={lead?.email} />
              <Field label="Phone number" name="phone" type="tel" value={lead?.phone} required={false} />
              <Field label="Lead source" name="source" value={lead?.source ?? "Walk-in"}>{options(LEAD_SOURCES)}</Field>
              <div className="full-width"><Field label="Vehicle of interest" name="vehicleId" value={lead?.vehicleId ?? ""} required={false}><option value="">General enquiry</option>{available.map((v) => <option key={v.id} value={v.id}>{v.year} {vehicleTitle(v)} ({v.stock})</option>)}</Field></div>
              <label className="form-field full-width"><span>Notes</span><textarea name="message" rows={3} maxLength={3000} defaultValue={lead?.message} /></label>
            </>}
            {editor.kind === "appointment" && <>
              <Field label="Customer name" name="customer" value={appointment?.customer} />
              <Field label="Appointment type" name="type" value={appointment?.type ?? "Test drive"}>{options(APPOINTMENT_TYPES)}</Field>
              <Field label="Email address" name="email" type="email" value={appointment?.email} required={false} />
              <Field label="Phone number" name="phone" type="tel" value={appointment?.phone} required={false} />
              <Field label="Date" name="date" type="date" min={appointment?.date ?? localDate(new Date())} value={appointment?.date ?? localDate(new Date())} />
              <Field label="Time" name="time" type="time" value={appointment?.time ?? "10:00"} />
              <div className="full-width"><Field label="Vehicle" name="vehicleId" value={appointment?.vehicleId ?? ""} required={false}><option value="">No specific vehicle</option>{available.map((v) => <option key={v.id} value={v.id}>{v.year} {vehicleTitle(v)} ({v.stock})</option>)}</Field></div>
              <label className="form-field full-width"><span>Notes</span><textarea name="notes" rows={2} maxLength={1000} defaultValue={appointment?.notes} /></label>
            </>}
            {editor.kind === "sale" && <>
              <label className="form-field"><span>Vehicle<i> *</i></span><select name="vehicleId" required value={saleVehicleId} onChange={(e) => setSaleVehicleId(e.target.value)}><option value="">Select a vehicle</option>{forSale.map((v) => <option key={v.id} value={v.id}>{v.year} {vehicleTitle(v)} ({v.stock})</option>)}</select></label>
              <Field label="Customer" name="leadId" value={editor.leadId ?? ""}><option value="">Select a customer</option>{data.leads.map((l) => <option value={l.id} key={l.id}>{l.name} ({l.email})</option>)}</Field>
              <Field key={saleVehicleId} label={`Sale amount (${currency})`} name="amount" type="number" min="1" step="0.01" value={data.vehicles.find((v) => v.id === saleVehicleId)?.price} />
              <Field label="Sale date" name="date" type="date" max={localDate(new Date())} value={localDate(new Date())} />
              <Field label="Payment method" name="payment" value="Bank transfer">{options(PAYMENT_METHODS)}</Field>
            </>}
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="dialog-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? <Loader2 size={16} className="spin" /> : record ? <Save size={16} /> : <Plus size={16} />}
              {record ? "Save changes" : editor.kind === "sale" ? "Record sale" : `Add ${editor.kind}`}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
