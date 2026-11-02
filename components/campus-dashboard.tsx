"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { ArrowUpRight, Bell, BookOpen, Building2, CalendarDays, ChevronRight, CircleHelp, Command, GraduationCap, LayoutDashboard, LogOut, Loader2, Megaphone, Menu, RefreshCw, Search, Users, X } from "lucide-react";
import BrandLogo from "@/components/brand-logo";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PreferenceSwitchers } from "@/components/dealer/shell";

type Row = { _id: string; [key: string]: unknown };
type Section = "overview" | "rooms" | "departments" | "courses" | "timetable" | "announcements" | "students" | "bookings";
type Data = Record<Exclude<Section, "overview">, Row[]> & { staff: { name: string; role: string }; integrationConfigured: boolean };
type Field = { key: string; label: string; type?: string; options?: string[]; source?: "departments" | "courses" | "rooms"; required?: boolean };

const websiteUrl = process.env.NEXT_PUBLIC_CLIENT_URL || "http://localhost:3000";
const tabs = [
  ["overview", "Overview", LayoutDashboard], ["rooms", "Rooms & locations", Building2],
  ["departments", "Departments", GraduationCap], ["courses", "Courses", BookOpen],
  ["timetable", "Timetable", CalendarDays], ["announcements", "Announcements", Megaphone],
  ["students", "Student accounts", Users], ["bookings", "Room bookings", CalendarDays],
] as const;
const fields: Partial<Record<Section, Field[]>> = {
  rooms: [
    { key: "code", label: "Location code" }, { key: "name", label: "Location name" }, { key: "building", label: "Building" },
    { key: "spaceType", label: "Space type", options: ["lecture_room", "laboratory", "seminar_room", "office", "library", "clinic", "cafeteria", "residence", "administrative", "other"] },
    { key: "floor", label: "Floor", type: "number" }, { key: "capacity", label: "Capacity", type: "number" },
    { key: "latitude", label: "Latitude", type: "number" }, { key: "longitude", label: "Longitude", type: "number" },
    { key: "equipment", label: "Equipment (comma separated)", required: false },
    { key: "description", label: "Description", type: "textarea", required: false },
    { key: "isAvailable", label: "Available", type: "checkbox" },
  ],
  departments: [{ key: "code", label: "Code" }, { key: "name", label: "Department name" }],
  courses: [{ key: "code", label: "Course code" }, { key: "title", label: "Course title" }, { key: "department", label: "Department", source: "departments" }],
  timetable: [
    { key: "academicYear", label: "Academic year" }, { key: "semester", label: "Semester" },
    { key: "department", label: "Department", source: "departments" }, { key: "course", label: "Course", source: "courses" },
    { key: "room", label: "Room", source: "rooms" }, { key: "cohort", label: "Cohort" }, { key: "lecturer", label: "Lecturer" },
    { key: "dayOfWeek", label: "Day", options: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] },
    { key: "startTime", label: "Start time (Lusaka)", type: "time" }, { key: "endTime", label: "End time (Lusaka)", type: "time" },
    { key: "notes", label: "Notes", type: "textarea", required: false }, { key: "status", label: "Visibility", options: ["draft", "published"] },
  ],
  announcements: [{ key: "title", label: "Title" }, { key: "message", label: "Message", type: "textarea" }, { key: "priority", label: "Priority", options: ["normal", "important", "urgent"] }, { key: "status", label: "Visibility", options: ["draft", "published"] }],
  students: [
    { key: "studentId", label: "Student ID" }, { key: "name", label: "Full name" }, { key: "email", label: "Email", type: "email" },
    { key: "password", label: "Password (10+ characters; leave blank to keep existing)", type: "password", required: false },
    { key: "department", label: "Department", required: false }, { key: "program", label: "Program", required: false },
    { key: "year", label: "Year", required: false }, { key: "phone", label: "Phone", required: false },
    { key: "status", label: "Account status", options: ["active", "pending", "inactive"] },
  ],
};
const columns: Record<Exclude<Section, "overview">, string[]> = {
  rooms: ["code", "name", "building", "spaceType", "capacity", "isAvailable"],
  departments: ["code", "name"], courses: ["code", "title", "department"],
  timetable: ["academicYear", "semester", "course", "room", "cohort", "lecturer", "dayOfWeek", "startTime", "endTime", "status"],
  announcements: ["title", "message", "priority", "status"],
  students: ["studentId", "name", "email", "department", "program", "status"],
  bookings: ["user", "room", "title", "purpose", "attendees", "startTime", "endTime", "status", "cancellationReason"],
};
const labels: Record<string, string> = { studentId: "Student ID", spaceType: "Space type", isAvailable: "Available", dayOfWeek: "Day", startTime: "Start", endTime: "End", academicYear: "Year", cancellationReason: "Cancellation reason" };
const badgeTone: Record<string, string> = { published: "green", active: "green", confirmed: "green", pending: "amber", important: "amber", draft: "blue", urgent: "red", cancelled: "red", inactive: "red" };

function display(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    const item = value as Record<string, unknown>;
    return [item.code || item.studentId, item.name || item.title].filter(Boolean).join(" · ") || "—";
  }
  return String(value);
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}
async function api(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, cache: "no-store", ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to complete this request.");
  return result;
}

export function CampusDashboard() {
  const [section, setSection] = useState<Section>("overview");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Record<string, unknown> | null>(null);
  const [mobile, setMobile] = useState(false);
  const [alerts, setAlerts] = useState(false);
  const [help, setHelp] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setData(await api("/api/campus")); setError(""); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to load campus data."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    api("/api/campus")
      .then((result) => { if (active) setData(result); })
      .catch((error: unknown) => { if (active) setError(error instanceof Error ? error.message : "Unable to load campus data."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchInput.current?.focus(); }
      if (event.key === "Escape") { setSearch(""); setAlerts(false); setMobile(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function navigate(next: Section) { setSection(next); setSearch(""); setEditor(null); setNotice(""); setError(""); setMobile(false); setAlerts(false); }
  function edit(row?: Row) {
    const value: Record<string, unknown> = row ? { _id: row._id } : {};
    for (const field of fields[section] || []) {
      const current = row?.[field.key];
      value[field.key] = field.type === "password" ? "" : field.key === "equipment" && Array.isArray(current) ? current.join(", ") :
        current && typeof current === "object" ? (current as Row)._id :
        current ?? (field.type === "checkbox" ? true : field.type === "number" ? 0 : field.key === "dayOfWeek" ? 1 : field.options?.[0] || "");
    }
    setEditor(value);
    setError("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setWorking(true); setError(""); setNotice("");
    const body = { ...editor };
    if ("equipment" in body) body.equipment = String(body.equipment).split(",").map((item) => item.trim()).filter(Boolean);
    if (body.password === "") delete body.password;
    try {
      await api(`/api/campus/${section}`, editor._id ? "PATCH" : "POST", body);
      setEditor(null);
      await load();
      setNotice(section === "timetable" && body.status === "published" ? "Timetable published. Conflicting bookings were cancelled automatically." : "Changes saved successfully.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save."); }
    finally { setWorking(false); }
  }
  async function remove(row: Row) {
    if (!window.confirm("Delete this record? This cannot be undone.")) return;
    setWorking(true); setError("");
    try { await api(`/api/campus/${section}?id=${row._id}`, "DELETE"); await load(); setNotice("Record deleted."); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to delete."); }
    finally { setWorking(false); }
  }
  async function bookingStatus(row: Row, status: string) {
    if (status === "cancelled" && !window.confirm("Cancel this room booking?")) return;
    setWorking(true); setError("");
    try { await api(`/api/campus/bookings/${row._id}`, "PATCH", { status }); await load(); setNotice(status === "confirmed" ? "Booking approved." : "Booking cancelled."); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to update booking."); }
    finally { setWorking(false); }
  }

  const title = tabs.find(([id]) => id === section)?.[1] ?? "Overview";
  const rows = section === "overview" ? [] : (data?.[section] || []).filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase()));
  const canEdit = section !== "students" || data?.staff.role === "admin";
  const pending = data?.bookings.filter((row) => row.status === "pending") ?? [];
  const term = search.trim().toLowerCase();
  const globalResults = term && data ? ([["rooms", "Rooms"], ["students", "Students"], ["courses", "Courses"], ["bookings", "Bookings"]] as const)
    .flatMap(([key, group]) => data[key].filter((row) => JSON.stringify(row).toLowerCase().includes(term)).slice(0, 3).map((row) => ({ key, group, row })))
    .slice(0, 7) : [];
  const staffName = data?.staff.name || "Staff workspace";
  const stats = [
    { label: "Lecture rooms", value: data?.rooms.filter((row) => row.spaceType === "lecture_room").length ?? 0, icon: Building2, target: "rooms" },
    { label: "Active students", value: data?.students.filter((row) => row.status === "active").length ?? 0, icon: Users, target: "students" },
    { label: "Pending bookings", value: pending.length, icon: CalendarDays, target: "bookings" },
    { label: "Published classes", value: data?.timetable.filter((row) => row.status === "published").length ?? 0, icon: BookOpen, target: "timetable" },
  ] as const;

  return (
    <div className="dealer-app">
      {mobile && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobile(false)} />}
      <aside className={`dealer-sidebar ${mobile ? "is-open" : ""}`}>
        <Link href="/" aria-label="UNILUS campus administration" className="dealer-brand" onClick={() => setMobile(false)}><BrandLogo /></Link>
        <a href={websiteUrl} target="_blank" rel="noreferrer" className="workspace-switch"><span className="workspace-avatar">U</span><span><strong>University of Lusaka</strong><small><i /> Student app</small></span><ArrowUpRight size={15} /></a>
        <div className="nav-label">CAMPUS WORKSPACE</div>
        <nav aria-label="Campus administration">
          {tabs.map(([id, label, Icon]) => (
            <button key={id} onClick={() => navigate(id)} className={`dealer-nav-item ${section === id ? "active" : ""}`}>
              <Icon size={19} /><span>{label}</span>{id === "bookings" && pending.length > 0 && <b>{pending.length}</b>}{section === id && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="dealer-nav-item" onClick={() => setHelp(true)}><CircleHelp size={19} />Help & getting started</button>
          <div className="sidebar-profile">
            <span className="person-avatar dark-avatar">{initials(staffName)}</span>
            <span><strong>{staffName}</strong><small>{data?.staff.role === "admin" ? "Administrator" : "Campus staff"}</small></span>
            <button className="icon-button" aria-label="Sign out" title="Sign out" onClick={() => void signOut({ callbackUrl: "/login" })}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
      <div className="dealer-workspace">
        <header className="dealer-topbar">
          <div className="topbar-breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobile(true)}><Menu size={20} /></button><span className="breadcrumb-root">Workspace</span><ChevronRight size={14} /><strong>{title}</strong></div>
          <div className="topbar-actions">
            <div className="global-search"><Search size={16} /><input ref={searchInput} aria-label="Search campus records" placeholder="Search…" value={search} onChange={(event) => setSearch(event.target.value)} /><span><Command size={11} /> K</span>
              {search && section === "overview" && <div className="search-results"><small>CAMPUS RECORDS</small>{globalResults.length ? globalResults.map(({ key, group, row }) => <button key={`${key}-${row._id}`} onClick={() => navigate(key)}><Search size={15} /><span><strong>{display(row.name ?? row.title ?? row.studentId ?? row.user)}</strong><small>{group}</small></span><ArrowUpRight size={14} /></button>) : <p>No matching records found.</p>}</div>}
            </div>
            <PreferenceSwitchers compact />
            <div className="notification-wrap"><button className="icon-button notification-button" aria-label="View notifications" onClick={() => setAlerts(!alerts)}><Bell size={19} />{pending.length > 0 && <i />}</button>
              {alerts && <div className="notification-panel">
                <div className="panel-heading"><strong>Updates</strong><button className="icon-button" aria-label="Close notifications" onClick={() => setAlerts(false)}><X size={16} /></button></div>
                <p>{pending.length} room {pending.length === 1 ? "booking needs" : "bookings need"} approval.</p><button className="text-link" onClick={() => navigate("bookings")}>Review bookings <ArrowUpRight size={14} /></button>
                <p>{data?.integrationConfigured ? "Student app integration is enabled." : "Student app integration is not configured."}</p>
              </div>}
            </div>
            <span className="topbar-divider" /><span className="person-avatar header-avatar" title={staffName}>{initials(staffName)}</span>
          </div>
        </header>
        {error && !editor && <div role="alert" className="storage-error">{error}</div>}
        <main className="dealer-main">
          <div className="page-heading">
            <div><h1>{title}</h1><p>Manage the campus. Keep students informed and learning spaces organized.</p></div>
            <div className="heading-actions">
              <button className="secondary-button" onClick={() => { setLoading(true); void load(); }} disabled={loading}>{loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}Refresh</button>
              {section !== "overview" && section !== "bookings" && canEdit && <button className="primary-button" onClick={() => edit()}>+ Add {section === "timetable" ? "allocation" : section === "students" ? "student" : "record"}</button>}
            </div>
          </div>
          {notice && <div role="status" className="campus-notice">{notice}</div>}
          {!data && loading && <p role="status">Loading campus workspace…</p>}

          {section === "overview" && data && <>
            <div className="stats-grid">
              {stats.map(({ label, value, icon: Icon, target }) => <button key={label} className="stat-card campus-stat-card" onClick={() => navigate(target)}><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={16} /></span></div><strong className="campus-stat-value">{value}</strong><small className="text-link">View details <ArrowUpRight size={13} /></small></button>)}
            </div>
            <div className="bottom-grid">
              <section className="dealer-panel">
                <div className="panel-heading"><div><h2>Booking approval queue</h2><p>Requests await staff approval. Pending requests reserve their timeslot.</p></div><button className="text-link" onClick={() => navigate("bookings")}>All bookings<ArrowUpRight size={15} /></button></div>
                <div className="campus-list">
                  {pending.slice(0, 6).map((row) => <div className="campus-queue" key={row._id}><div><strong>{display(row.title)}</strong><small>{display(row.user)} · {display(row.room)}</small></div><button className="secondary-button" onClick={() => navigate("bookings")}>Review</button></div>)}
                  {!pending.length && <div className="empty-state"><h3>You’re all caught up</h3><p>No bookings awaiting approval.</p></div>}
                </div>
              </section>
              <section className="dealer-panel">
                <div className="panel-heading"><div><h2>Your connected campus</h2><p>Published timetables, announcements and locations appear in the student app.</p></div></div>
                <ul className="status-list campus-guide"><li><span>Create departments and courses</span></li><li><span>Add campus locations with map coordinates</span></li><li><span>Publish conflict-free teaching allocations</span></li><li><span>Review and approve student room requests</span></li></ul>
                <div className="campus-panel-action"><button className="primary-button" onClick={() => navigate("timetable")}>Manage timetable</button></div>
              </section>
            </div>
          </>}

          {section !== "overview" && data && <section className="dealer-panel">
            {section === "timetable" && <p className="campus-info">All times are Africa/Lusaka. Publishing cancels conflicting student bookings and is immediately visible to students. Drafts remain private.</p>}
            {section === "rooms" && <p className="campus-info">All space types appear on campus maps. Only available lecture_room spaces can be booked by students.</p>}
            {section === "students" && !canEdit && <p className="campus-info">Only administrators may create, edit or deactivate student accounts.</p>}
            <div className="table-scroll"><table><thead><tr>{columns[section].map((key) => <th key={key}>{labels[key] || key}</th>)}<th>Actions</th></tr></thead><tbody>
              {rows.map((row) => <tr key={row._id}>{columns[section].map((key) => <td key={key}>{key === "status" || key === "priority" ? <span className={`status-badge ${badgeTone[String(row[key])] || ""}`}><i />{display(row[key])}</span> : key === "dayOfWeek" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][Number(row[key])] : (key === "startTime" || key === "endTime") && section === "bookings" ? new Date(String(row[key])).toLocaleString("en-GB", { timeZone: "Africa/Lusaka" }) : display(row[key])}</td>)}<td><div className="table-actions">{section === "bookings" ? row.status !== "cancelled" && <>{row.status === "pending" && <button className="text-link" disabled={working} onClick={() => bookingStatus(row, "confirmed")}>Approve</button>}<button className="text-link" disabled={working} onClick={() => bookingStatus(row, "cancelled")}>Cancel</button></> : canEdit && <><button className="text-link" onClick={() => edit(row)}>Edit</button>{section !== "students" && <button className="text-link" disabled={working} onClick={() => remove(row)}>Delete</button>}</>}</div></td></tr>)}
              {!rows.length && <tr><td colSpan={columns[section].length + 1}><div className="empty-state"><h3>{loading ? "Loading…" : "No records found"}</h3>{!loading && <p>{search ? "Try a different search." : "Add your first record to get started."}</p>}</div></td></tr>}
            </tbody></table></div>
            <div className="table-note">{rows.length} {rows.length === 1 ? "record" : "records"} <span>Changes sync to the student app immediately.</span></div>
          </section>}
        </main>
        <footer className="dealer-footer"><span>&copy; {new Date().getFullYear()} University of Lusaka</span><span><i /> {data?.integrationConfigured ? "Student integration enabled" : "Staff workspace"}</span></footer>
      </div>

      <Dialog open={!!editor} onOpenChange={(open) => { if (!open) setEditor(null); }}>
        <DialogContent className="dealer-dialog record-dialog">
          <DialogTitle>{editor?._id ? "Edit" : "Add"} {section === "timetable" ? "allocation" : section === "students" ? "student account" : "record"}</DialogTitle>
          <DialogDescription>Saved changes are published to the student app in real time.</DialogDescription>
          {editor && <form onSubmit={save}>
            <div className="campus-form-grid">{(fields[section] || []).map((field) => <label key={field.key} className={`form-field ${field.type === "textarea" ? "full-width" : ""}`}><span>{field.label}</span>
              {field.type === "checkbox" ? <input type="checkbox" checked={Boolean(editor[field.key])} onChange={(event) => setEditor({ ...editor, [field.key]: event.target.checked })} /> :
                field.options || field.source ? <select required value={String(editor[field.key] ?? "")} onChange={(event) => setEditor({ ...editor, [field.key]: field.key === "dayOfWeek" ? Number(event.target.value) : event.target.value })}><option value="">Select…</option>{field.source ? (data?.[field.source] || []).map((row) => <option key={row._id} value={row._id}>{display(row)}</option>) : field.options?.map((option, index) => <option key={option} value={field.key === "dayOfWeek" ? index : option}>{option.replaceAll("_", " ")}</option>)}</select> :
                  field.type === "textarea" ? <textarea required={field.required !== false} value={String(editor[field.key] ?? "")} onChange={(event) => setEditor({ ...editor, [field.key]: event.target.value })} rows={3} /> :
                    <input type={field.type || "text"} step={field.type === "number" ? "any" : undefined} required={field.required !== false} minLength={field.type === "password" ? 10 : undefined} autoComplete={field.type === "password" ? "new-password" : undefined} value={String(editor[field.key] ?? "")} onChange={(event) => setEditor({ ...editor, [field.key]: field.type === "number" ? Number(event.target.value) : event.target.value })} />}
            </label>)}</div>
            {error && <div role="alert" className="form-error">{error}</div>}
            <div className="dialog-actions"><button type="button" className="secondary-button" disabled={working} onClick={() => setEditor(null)}>Cancel</button><button type="submit" className="primary-button" disabled={working}>{working ? "Saving…" : "Save changes"}</button></div>
          </form>}
        </DialogContent>
      </Dialog>

      <Dialog open={help} onOpenChange={setHelp}><DialogContent className="dealer-dialog"><DialogTitle>Getting started</DialogTitle><DialogDescription>Everything you do here is saved to the campus database and published to the UNILUS student app in real time.</DialogDescription><div className="help-steps">
        <p><Building2 size={20} /><span><strong>Map the campus</strong>Add rooms and locations with coordinates so students can navigate to them.</span></p>
        <p><CalendarDays size={20} /><span><strong>Publish timetables</strong>Published allocations appear in the student timetable and block conflicting room bookings.</span></p>
        <p><Megaphone size={20} /><span><strong>Announce</strong>Published announcements are delivered to students instantly.</span></p>
        <p><Users size={20} /><span><strong>Approve bookings</strong>Student lecture-room requests wait here until you approve or cancel them.</span></p>
      </div><button className="primary-button" onClick={() => setHelp(false)}>Got it</button></DialogContent></Dialog>
    </div>
  );
}
