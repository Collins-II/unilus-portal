"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/client/api";
import { importFields, MAX_IMPORT_RECORDS, type ImportResource } from "@/lib/campus/import-policy";

type Counts = { created: number; updated: number; skipped: number };
type Preview = {
  previewId: string;
  expiresAt: string;
  counts: Counts;
  rows: { identity: string; label: string; action: "create" | "update" | "skip"; values: Record<string, string> }[];
};
type Props = { resource: ImportResource; onClose: () => void; onImported: (message: string) => void };

export function ImportDialog({ resource, onClose, onImported }: Props) {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [recordsPath, setRecordsPath] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>(() => Object.fromEntries(importFields[resource].map((field) => [field.key, field.key])));
  const [updateExisting, setUpdateExisting] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function fetchPreview(event: React.FormEvent) {
    event.preventDefault();
    setWorking(true); setError("");
    try {
      const result = await api<Preview>("/api/campus/imports", { body: { resource, url, token, recordsPath, mapping, updateExisting } });
      setPreview(result);
      setToken("");
    } catch (error) { setError(errorMessage(error)); }
    finally { setWorking(false); }
  }
  async function confirm() {
    if (!preview) return;
    setWorking(true); setError("");
    try {
      const { counts } = await api<{ counts: Counts }>("/api/campus/imports", { method: "PATCH", body: { previewId: preview.previewId } });
      onImported(`Import complete: ${counts.created} created, ${counts.updated} updated, ${counts.skipped} skipped.`);
    } catch (error) { setError(errorMessage(error)); }
    finally { setWorking(false); }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !working) onClose(); }}>
    <DialogContent className="dealer-dialog record-dialog campus-import-dialog" showCloseButton={!working}
      onEscapeKeyDown={(event) => { if (working) event.preventDefault(); }}
      onInteractOutside={(event) => { if (working) event.preventDefault(); }}>
      <DialogTitle>Import {resource} from an API</DialogTitle>
      <DialogDescription>Read an external JSON API, review the changes, then import into the shared UNILUS campus database. No records are deleted.</DialogDescription>
      {!preview ? <form onSubmit={fetchPreview}>
        <fieldset disabled={working} className="campus-form-grid">
          <label className="form-field full-width"><span>HTTPS API URL</span><input type="url" aria-label="HTTPS API URL" aria-describedby="import-url-help" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder={`https://your-provider.example/api/${resource}`} /><small id="import-url-help">Public HTTPS endpoints only. Enter one page of up to {MAX_IMPORT_RECORDS} records (2 MiB maximum).</small></label>
          <label className="form-field"><span>Bearer token (optional)</span><input type="password" aria-label="Bearer token (optional)" aria-describedby="import-token-help" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} /><small id="import-token-help">Used server-side for this request only; not saved. Avoid tokens in URLs.</small></label>
          <label className="form-field"><span>Records array path (optional)</span><input aria-label="Records array path (optional)" aria-describedby="import-path-help" value={recordsPath} onChange={(event) => setRecordsPath(event.target.value)} placeholder={`data.${resource}`} /><small id="import-path-help">Leave blank for a top-level array. Use dot notation for nested JSON.</small></label>
          <div className="full-width import-mapping-heading"><strong>Field mapping</strong><p>Enter the source JSON field for each campus field. Optional blank mappings leave existing values unchanged.</p></div>
          {importFields[resource].map((field) => <label className="form-field" key={field.key}><span>{field.label}{field.required ? " *" : " (optional)"}</span><input required={field.required} value={mapping[field.key] ?? ""} onChange={(event) => setMapping({ ...mapping, [field.key]: event.target.value })} placeholder={field.key} /></label>)}
          <label className="import-checkbox full-width"><input type="checkbox" checked={updateExisting} onChange={(event) => setUpdateExisting(event.target.checked)} /><span>Update existing {resource} with matching {resource === "students" ? "student IDs" : "course codes"}; otherwise skip them.</span></label>
        </fieldset>
        <p className="import-policy-note">{resource === "students" ? "New accounts are pending and require a staff-set password before activation. Existing passwords, roles and account statuses are never imported or overwritten." : "Department codes must already exist. Course department changes cannot invalidate existing timetable allocations."}</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="dialog-actions"><button type="button" className="secondary-button" disabled={working} onClick={onClose}>Cancel</button><button className="primary-button" disabled={working}>{working ? <Loader2 size={16} className="spin" /> : <Download size={16} />}{working ? "Fetching preview..." : "Preview import"}</button></div>
      </form> : <>
        <div className="import-summary" role="status"><strong>{preview.counts.created} new</strong><strong>{preview.counts.updated} updates</strong><strong>{preview.counts.skipped} skipped</strong></div>
        <p className="import-policy-note">Review every row before confirming. This preview expires at {new Date(preview.expiresAt).toLocaleTimeString()}. Changed campus records require a fresh preview.</p>
        <div className="table-scroll import-preview"><table><thead><tr>{importFields[resource].map((field) => <th key={field.key}>{field.label}</th>)}<th>Action</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.identity}>{importFields[resource].map((field) => <td key={field.key}>{row.values[field.key] ?? "Unchanged / not supplied"}</td>)}<td><span className={`status-badge ${row.action === "create" ? "green" : row.action === "update" ? "blue" : ""}`}>{row.action}</span></td></tr>)}</tbody></table></div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="dialog-actions"><button type="button" className="secondary-button" disabled={working} onClick={() => { setPreview(null); setError(""); }}>Back</button><button type="button" className="primary-button" disabled={working || preview.counts.created + preview.counts.updated === 0} onClick={() => void confirm()}>{working ? <Loader2 size={16} className="spin" /> : <Download size={16} />}{working ? "Importing..." : "Confirm import"}</button></div>
      </>}
    </DialogContent>
  </Dialog>;
}
