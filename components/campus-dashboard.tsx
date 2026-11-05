"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { signOut } from "next-auth/react";
import { ArrowUpRight, Bell, BookOpen, Building2, CalendarDays, ChevronRight, CircleHelp, Command, Download, GraduationCap, LayoutDashboard, LogOut, Loader2, Megaphone, Menu, RefreshCw, Search, Users, X } from "lucide-react";
import BrandLogo from "@/components/brand-logo";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PreferenceSwitchers } from "@/components/dealer/shell";
import { api, errorMessage } from "@/lib/client/api";
import { ImportDialog } from "@/components/campus/import-dialog";
import type { MapPoint } from "@/components/campus/location-picker";
import type { ImportResource } from "@/lib/campus/import-policy";
import { campuses, campusFor, campusIds, type CampusId } from "@/lib/campus/geography";
import { ScheduleDialog } from "@/components/campus/schedule-dialog";
import { hasTeachingProperties } from "@/lib/campus/location-properties";

const LocationPicker = dynamic(() => import("@/components/campus/location-picker"), { ssr: false, loading: () => <p role="status">Loading location picker...</p> });

type Row = { _id: string; [key: string]: unknown };
type Section = "overview" | "rooms" | "departments" | "programmes" | "courses" | "timetable" | "announcements" | "students" | "bookings";
type Data = Record<Exclude<Section, "overview">, Row[]> & { staff: { name: string; role: string }; integrationConfigured: boolean };
type Field = { key: string; label: string; type?: string; options?: string[]; source?: "departments" | "programmes" | "courses" | "rooms"; required?: boolean; min?: number; max?: number };

const websiteUrl = process.env.NEXT_PUBLIC_CLIENT_URL || "http://localhost:3000";
const tabs = [
  ["overview", "Overview", LayoutDashboard], ["rooms", "Rooms & locations", Building2],
  ["departments", "Departments", GraduationCap], ["courses", "Courses", BookOpen],
  ["programmes", "Study programmes", GraduationCap],
  ["timetable", "Timetable", CalendarDays], ["announcements", "Announcements", Megaphone],
  ["students", "Student accounts", Users], ["bookings", "Room bookings", CalendarDays],
] as const;
const fields: Partial<Record<Section, Field[]>> = {
  rooms: [
    { key: "code", label: "Location code" }, { key: "name", label: "Location name" }, { key: "building", label: "Building" },
    { key: "spaceType", label: "Space type", options: ["lecture_room", "laboratory", "seminar_room", "office", "library", "clinic", "cafeteria", "residence", "administrative", "other"] },
    { key: "floor", label: "Floor", type: "number", min: -10, max: 200 }, { key: "capacity", label: "Capacity", type: "number", min: 0, max: 10000 },
    { key: "latitude", label: "Latitude", type: "number", min: -90, max: 90 }, { key: "longitude", label: "Longitude", type: "number", min: -180, max: 180 },
    { key: "equipment", label: "Equipment (comma separated)", required: false },
    { key: "description", label: "Description", type: "textarea", required: false },
    { key: "isAvailable", label: "Available", type: "checkbox" },
  ],
  departments: [{ key: "code", label: "Code" }, { key: "name", label: "Department name" }],
  programmes: [{ key: "code", label: "Programme code" }, { key: "name", label: "Programme name" }, { key: "department", label: "Department", source: "departments" }, { key: "campus", label: "Assigned campus", options: [...campusIds] }],
  courses: [{ key: "code", label: "Course code" }, { key: "title", label: "Course title" }, { key: "department", label: "Department", source: "departments" }],
  timetable: [
    { key: "academicYear", label: "Academic year" }, { key: "semester", label: "Semester" },
    { key: "department", label: "Department", source: "departments" }, { key: "course", label: "Course", source: "courses" },
    { key: "room", label: "Room", source: "rooms" }, { key: "cohort", label: "Cohort" }, { key: "lecturer", label: "Lecturer" },
    { key: "dayOfWeek", label: "Day", options: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] },
    { key: "startTime", label: "Start time (Lusaka)", type: "time" }, { key: "endTime", label: "End time (Lusaka)", type: "time" },
    { key: "notes", label: "Notes", type: "textarea", required: false }, { key: "status", label: "Visibility", options: ["draft", "published"] },
    { key: "classSize", label: "Class size (0 if not yet verified)", type: "number", min: 0, max: 10000 },
    { key: "requiredEquipment", label: "Required equipment (comma separated)", required: false },
    { key: "roomType", label: "Required room type", options: ["lecture_room", "laboratory", "seminar_room"] },
  ],
  announcements: [{ key: "title", label: "Title" }, { key: "message", label: "Message", type: "textarea" }, { key: "priority", label: "Priority", options: ["normal", "important", "urgent"] }, { key: "status", label: "Visibility", options: ["draft", "published"] }],
  students: [
    { key: "studentId", label: "Student ID" }, { key: "name", label: "Full name" }, { key: "email", label: "Email", type: "email" },
    { key: "password", label: "Password (10+ characters; leave blank to keep existing)", type: "password", required: false },
    { key: "program", label: "Study programme", source: "programmes", required: false },
    { key: "year", label: "Year", required: false }, { key: "phone", label: "Phone", required: false },
    { key: "status", label: "Account status", options: ["active", "pending", "inactive"] },
  ],
};
const columns: Record<Exclude<Section, "overview">, string[]> = {
  rooms: ["code", "name", "building", "spaceType", "capacity", "isAvailable"],
  departments: ["code", "name"], courses: ["code", "title", "department"],
  programmes: ["code", "name", "department", "campus"],
  timetable: ["academicYear", "semester", "course", "room", "cohort", "lecturer", "classSize", "dayOfWeek", "startTime", "endTime", "status"],
  announcements: ["title", "message", "priority", "status"],
  students: ["studentId", "name", "email", "department", "program", "campus", "status"],
  bookings: ["user", "room", "title", "purpose", "attendees", "startTime", "endTime", "status", "cancellationReason"],
};
const labels: Record<string, string> = { studentId: "Student ID", spaceType: "Space type", isAvailable: "Available", dayOfWeek: "Day", startTime: "Start", endTime: "End", academicYear: "Academic year", cancellationReason: "Cancellation reason" };
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
function mapPoint(row: Record<string, unknown>): MapPoint | null {
  const { latitude, longitude } = row;
  return typeof latitude === "number" && Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
    typeof longitude === "number" && Number.isFinite(longitude) && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}

export function CampusDashboard() {
  const [section, setSection] = useState<Section>("overview");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Record<string, unknown> | null>(null);
  const [mobile, setMobile] = useState(false);
  const [alerts, setAlerts] = useState(false);
  const [help, setHelp] = useState(false);
  const [importing, setImporting] = useState<ImportResource | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [campusId, setCampusId] = useState<CampusId>("silverest");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const searchInput = useRef<HTMLInputElement>(null);
  const refreshId = useRef(0);

  const load = useCallback(async () => {
    const id = ++refreshId.current;
    try { const result = await api<Data>("/api/campus"); if (id === refreshId.current) { setData(result); setLoadError(""); } }
    catch (error) { if (id === refreshId.current) setLoadError(errorMessage(error)); }
    finally { if (id === refreshId.current) setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    const id = ++refreshId.current;
    api<Data>("/api/campus")
      .then((result) => { if (active && id === refreshId.current) setData(result); })
      .catch((error: unknown) => { if (active && id === refreshId.current) setLoadError(errorMessage(error)); })
      .finally(() => { if (active && id === refreshId.current) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (working || editor || importing || scheduling || loading) return;
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [working, editor, importing, scheduling, loading, load]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchInput.current?.focus(); }
      if (event.key === "Escape" && !editor && !importing) { setSearch(""); setPage(1); setAlerts(false); setMobile(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor, importing]);

  function navigate(next: Section) { setSection(next); setSearch(""); setPage(1); setStatusFilter("all"); setEditor(null); setNotice(""); setError(""); setMobile(false); setAlerts(false); }
  function edit(row?: Row) {
    const value: Record<string, unknown> = row ? { _id: row._id } : {};
    for (const field of fields[section] || []) {
      const current = row?.[field.key];
      value[field.key] = field.type === "password" ? "" : (field.key === "equipment" || field.key === "requiredEquipment") && Array.isArray(current) ? current.join(", ") :
        current && typeof current === "object" ? (current as Row)._id :
        current ?? (field.type === "checkbox" ? true : field.key === "latitude" || field.key === "longitude" ? "" : field.type === "number" ? 0 : field.key === "dayOfWeek" ? 1 : field.options?.[0] || "");
    }
    if (section === "rooms" && row) {
      const point = mapPoint(row);
      const campus = point ? campusFor(point) : null;
      if (campus) setCampusId(campus.id);
    }
    if (section === "timetable" && row?.room && typeof row.room === "object") {
      const room = row.room as Row;
      const point = mapPoint(room);
      const campus = point ? campusFor(point) : null;
      if (campus) setCampusId(campus.id);
      value.roomType = row.roomType ?? room.spaceType ?? "lecture_room";
    }
    setEditor(value);
    setError("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    if (section === "rooms") {
      const point = mapPoint(editor);
      if (!point || campusFor(point)?.id !== campusId) { setError("Choose coordinates inside the selected UNILUS navigation scope."); return; }
    }
    setWorking(true); setError(""); setNotice("");
    const body = { ...editor };
    if ("equipment" in body) body.equipment = String(body.equipment).split(",").map((item) => item.trim()).filter(Boolean);
    if ("requiredEquipment" in body) body.requiredEquipment = String(body.requiredEquipment).split(",").map((item) => item.trim()).filter(Boolean);
    if (body.password === "") delete body.password;
    try {
      await api(`/api/campus/${section}`, { method: editor._id ? "PATCH" : "POST", body });
      setEditor(null);
      await load();
      setNotice(section === "timetable" && body.status === "published" ? "Timetable published. Conflicting bookings were cancelled automatically." : "Changes saved successfully.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save."); }
    finally { setWorking(false); }
  }
  async function remove(row: Row) {
    if (!window.confirm("Delete this record? This cannot be undone.")) return;
    setWorking(true); setError("");
    try { await api(`/api/campus/${section}?id=${row._id}`, { method: "DELETE" }); await load(); setNotice("Record deleted."); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to delete."); }
    finally { setWorking(false); }
  }
  async function bookingStatus(row: Row, status: string) {
    if (status === "cancelled" && !window.confirm("Cancel this room booking?")) return;
    setWorking(true); setError("");
    try { await api(`/api/campus/bookings/${row._id}`, { method: "PATCH", body: { status } }); await load(); setNotice(status === "confirmed" ? "Booking approved." : "Booking cancelled."); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to update booking."); }
    finally { setWorking(false); }
  }

  const title = tabs.find(([id]) => id === section)?.[1] ?? "Overview";
  const rows = section === "overview" ? [] : (data?.[section] || []).filter((row) => {
    const location = section === "rooms" ? row : section === "timetable" && row.room && typeof row.room === "object" ? row.room as Row : null;
    const point = location ? mapPoint(location) : null;
    const campus = point ? campusFor(point) : null;
    return (!campus || campus.id === campusId) && JSON.stringify(row).toLowerCase().includes(search.trim().toLowerCase()) && (statusFilter === "all" || row.status === statusFilter);
  });
  const pageCount = Math.max(1, Math.ceil(rows.length / 25));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = rows.slice((currentPage - 1) * 25, currentPage * 25);
  const roomLocations = (data?.rooms || []).map(mapPoint).filter((point): point is MapPoint => point !== null);
  const selectedPoint = editor ? mapPoint(editor) : null;
  const statuses = section === "students" ? ["active", "pending", "inactive"] : section === "bookings" ? ["pending", "confirmed", "cancelled"] : section === "timetable" || section === "announcements" ? ["draft", "published"] : [];
  const canEdit = (section !== "students" && section !== "programmes") || data?.staff.role === "admin";
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
  function changeField(field: Field, value: unknown) {
    setEditor((current) => current ? { ...current, [field.key]: value, ...(section === "timetable" && field.key === "department" ? { course: "" } : {}),
      ...(section === "rooms" && field.key === "spaceType" && !hasTeachingProperties(value) ? { capacity: 0, equipment: "" } : {}) } : null);
  }
  function sourceRows(field: Field) {
    const records = field.source ? data?.[field.source] || [] : [];
    if (section !== "timetable") return records;
    if (field.source === "rooms") return records.filter((row) => {
      const point = mapPoint(row);
      return row.isAvailable && ["lecture_room", "laboratory", "seminar_room"].includes(String(row.spaceType)) && point && campusFor(point)?.id === campusId;
    });
    if (field.source === "courses") return records.filter((row) => {
      const department = row.department;
      return (department && typeof department === "object" ? (department as Row)._id : department) === editor?.department;
    });
    return records;
  }

  return (
    <div className="dealer-app">
      {mobile && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobile(false)} />}
      <aside className={`dealer-sidebar ${mobile ? "is-open" : ""}`}>
        <Link href="/" aria-label="UNILUS campus administration" className="dealer-brand" onClick={() => setMobile(false)}><BrandLogo /></Link>
        <a href={websiteUrl} target="_blank" rel="noreferrer" className="workspace-switch"><span className="workspace-avatar">Z</span><span><strong>University of Zambia</strong><small><i /> Student app</small></span><ArrowUpRight size={15} /></a>
        <div className="nav-label">CAMPUS WORKSPACE</div>
        <nav aria-label="Campus administration">
          {tabs.map(([id, label, Icon]) => (
            <button key={id} onClick={() => navigate(id)} className={`dealer-nav-item ${section === id ? "active" : ""}`}>
              <Icon size={19} /><span>{label}</span>{id === "bookings" && pending.length > 0 && <b>{pending.length}</b>}{section === id && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link className="dealer-nav-item" href="/assessments"><BookOpen size={19} /><span>Quizzes, tests & exams</span></Link>
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
            <div className="global-search"><Search size={16} /><input ref={searchInput} aria-label="Search campus records" placeholder="Search…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><span><Command size={11} /> K</span>
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
        {(loadError || (error && !editor)) && <div role="alert" className="storage-error">{error && !editor ? error : loadError}</div>}
        <main className="dealer-main">
          <div className="page-heading">
            <div><h1>{title}</h1><p>Manage the campus. Keep students informed and learning spaces organized.</p></div>
            <div className="heading-actions">
              <label className="form-field"><span>Campus</span><select aria-label="Campus" disabled={working} value={campusId} onChange={(event) => { setCampusId(event.target.value as CampusId); setPage(1); if (editor && section === "rooms") setEditor({ ...editor, latitude: "", longitude: "" }); if (editor && section === "timetable") setEditor({ ...editor, room: "" }); }}>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>
              <button className="secondary-button" onClick={() => { setLoading(true); void load(); }} disabled={loading}>{loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}Refresh</button>
              {(section === "students" || section === "courses") && data?.staff.role === "admin" && <button className="secondary-button" disabled={working || loading} onClick={() => setImporting(section)}><Download size={16} />Import from API</button>}
              {section === "timetable" && data?.staff.role === "admin" && <button className="secondary-button" disabled={working || loading} onClick={() => setScheduling(true)}><CalendarDays size={16} />Smart auto-allocate</button>}
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
              <section className="dealer-panel px-4">
                <div className="panel-heading"><div><h2>Your connected campus</h2><p>Published timetables, announcements and locations appear in the student app.</p></div></div>
                <ul className="status-list campus-guide"><li><span>Create departments and courses</span></li><li><span>Add campus locations with map coordinates</span></li><li><span>Publish conflict-free teaching allocations</span></li><li><span>Review and approve student room requests</span></li></ul>
                <div className="campus-panel-action"><button className="primary-button" onClick={() => navigate("timetable")}>Manage timetable</button></div>
              </section>
            </div>
          </>}

          {section !== "overview" && data && <section className="dealer-panel">
            {statuses.length > 0 && <div className="campus-table-toolbar"><label className="form-field"><span>Filter by status</span><select aria-label="Filter by status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><small>Refreshes every 15 seconds while this page is visible.</small></div>}
            {section === "timetable" && <p className="campus-info">All times are Africa/Lusaka. Publishing cancels conflicting student bookings and is immediately visible to students. Drafts remain private.</p>}
            {section === "rooms" && <p className="campus-info">The selected campus filters mapped locations and room choices. Unverified legacy locations remain visible for correction. Only available lecture_room spaces can be booked by students. {campuses.find((campus) => campus.id === campusId)?.scopeKind === "approximate" && "Massmedia uses an approximate Alick Nkhata Road view area, not a verified campus boundary. Independently verify room coordinates."}</p>}
            {section === "students" && !canEdit && <p className="campus-info">Only administrators may create, edit or deactivate student accounts.</p>}
            <div className="table-scroll"><table><thead><tr>{columns[section].map((key) => <th key={key}>{labels[key] || key}</th>)}<th>Actions</th></tr></thead><tbody>
              {visibleRows.map((row) => <tr key={row._id}>{columns[section].map((key) => <td key={key}>{key === "status" || key === "priority" ? <><span className={`status-badge ${badgeTone[String(row[key])] || ""}`}><i />{display(row[key])}</span>{key === "status" && row.passwordSetupRequired === true && <small className="password-setup-note">Password setup required</small>}</> : key === "dayOfWeek" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][Number(row[key])] : (key === "startTime" || key === "endTime") && section === "bookings" ? new Date(String(row[key])).toLocaleString("en-GB", { timeZone: "Africa/Lusaka" }) : display(row[key])}</td>)}<td><div className="table-actions">{section === "bookings" ? row.status !== "cancelled" && new Date(String(row.endTime)) > new Date() && <>{row.status === "pending" && <button className="text-link" disabled={working} onClick={() => bookingStatus(row, "confirmed")}>Approve</button>}<button className="text-link" disabled={working} onClick={() => bookingStatus(row, "cancelled")}>Cancel</button></> : canEdit && <><button className="text-link" disabled={working} onClick={() => edit(row)}>Edit</button>{section !== "students" && <button className="text-link" disabled={working} onClick={() => remove(row)}>Delete</button>}</>}</div></td></tr>)}
              {!rows.length && <tr><td colSpan={columns[section].length + 1}><div className="empty-state"><h3>{loading ? "Loading…" : "No records found"}</h3>{!loading && <p>{search || statusFilter !== "all" ? "Try a different search or status filter." : section === "bookings" ? "Student room requests will appear here." : "Add your first record to get started."}</p>}</div></td></tr>}
            </tbody></table></div>
            <div className="table-note">{rows.length} {rows.length === 1 ? "record" : "records"} <span>Changes sync to the student app immediately.</span></div>
            {pageCount > 1 && <nav className="campus-pagination" aria-label="Records pagination"><button className="secondary-button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span role="status">Page {currentPage} of {pageCount} · {(currentPage - 1) * 25 + 1}–{Math.min(currentPage * 25, rows.length)} of {rows.length}</span><button className="secondary-button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
          </section>}
        </main>
        <footer className="dealer-footer"><span>&copy; {new Date().getFullYear()} University of Zambia</span><span><i /> {data?.integrationConfigured ? "Student integration enabled" : "Staff workspace"}</span></footer>
      </div>

      <Dialog open={!!editor} onOpenChange={(open) => { if (!open && !working) setEditor(null); }}>
        <DialogContent className={`dealer-dialog record-dialog ${section === "rooms" ? "campus-room-dialog" : ""}`} showCloseButton={!working} onEscapeKeyDown={(event) => { if (working) event.preventDefault(); }} onInteractOutside={(event) => { if (working) event.preventDefault(); }}>
          <DialogTitle>{editor?._id ? "Edit" : "Add"} {section === "rooms" ? "room / location" : section === "timetable" ? "allocation" : section === "students" ? "student account" : "record"}</DialogTitle>
          <DialogDescription>{section === "rooms" ? "Choose a verified map location so students can find this space and navigate to it." : section === "timetable" || section === "announcements" ? "Drafts stay private. Published records are visible in the student app." : "Save campus records to the shared student-app database."}</DialogDescription>
          {editor && <form onSubmit={save}>
            {section === "rooms" && <><label className="form-field"><span>Campus</span><select aria-label="Room campus" disabled={working} value={campusId} onChange={(event) => { setCampusId(event.target.value as CampusId); setEditor({ ...editor, latitude: "", longitude: "" }); }}>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label><LocationPicker value={selectedPoint} locations={roomLocations} campusId={campusId} disabled={working} onChange={(point) => setEditor((current) => current ? { ...current, ...point } : null)} /></>}
            {section === "students" && Boolean(editor._id) && data?.students.find((student) => student._id === editor._id)?.passwordSetupRequired === true && <p className="import-policy-note">This imported account needs a password before activation.</p>}
            {section === "students" && <p className="campus-info">Department and campus are assigned automatically from the selected programme. Unassigned legacy students keep their existing academic information until reassigned.</p>}
            <fieldset disabled={working} className="campus-form-grid">{(fields[section] || []).filter((field) => section !== "rooms" || !["capacity", "equipment"].includes(field.key) || hasTeachingProperties(editor.spaceType)).map((field) => <label key={field.key} className={`form-field ${field.type === "textarea" ? "full-width" : ""}`}><span>{field.type === "password" && !editor._id ? "Password (10+ characters)" : field.label}</span>
              {field.type === "checkbox" ? <input type="checkbox" checked={Boolean(editor[field.key])} onChange={(event) => changeField(field, event.target.checked)} /> :
                field.options || field.source ? <select aria-label={field.label} required={field.required !== false} value={String(editor[field.key] ?? "")} onChange={(event) => changeField(field, field.key === "dayOfWeek" ? Number(event.target.value) : event.target.value)}><option value="">Select…</option>{field.source === "programmes" && Boolean(editor.program) && !data?.programmes.some((row) => row.code === editor.program) && <option value={String(editor.program)}>Legacy: {String(editor.program)}</option>}{field.source ? sourceRows(field).map((row) => <option key={row._id} value={field.source === "programmes" ? String(row.code) : row._id}>{display(row)}{field.source === "programmes" ? ` (${String(row.campus)})` : ""}</option>) : field.options?.map((option, index) => <option key={option} value={field.key === "dayOfWeek" ? index : option}>{option.replaceAll("_", " ")}</option>)}</select> :
                  field.type === "textarea" ? <textarea required={field.required !== false} value={String(editor[field.key] ?? "")} onChange={(event) => changeField(field, event.target.value)} rows={3} /> :
                    <input type={field.type || "text"} min={field.min} max={field.max} step={field.key === "latitude" || field.key === "longitude" ? "any" : field.type === "number" ? 1 : undefined} required={field.required !== false || (field.type === "password" && !editor._id)} minLength={field.type === "password" ? 10 : undefined} autoComplete={field.type === "password" ? "new-password" : undefined} value={String(editor[field.key] ?? "")} onChange={(event) => changeField(field, field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)} />}
            </label>)}</fieldset>
            {error && <div role="alert" className="form-error">{error}</div>}
            <div className="dialog-actions"><button type="button" className="secondary-button" disabled={working} onClick={() => setEditor(null)}>Cancel</button><button type="submit" className="primary-button" disabled={working}>{working ? "Saving…" : "Save changes"}</button></div>
          </form>}
        </DialogContent>
      </Dialog>

      {importing && <ImportDialog resource={importing} onClose={() => setImporting(null)} onImported={(message) => { setImporting(null); setNotice(message); setError(""); setPage(1); void load(); }} />}
      {scheduling && data && <ScheduleDialog campusId={campusId}
        courses={data.courses.map((row) => ({ _id: row._id, code: String(row.code), title: String(row.title), department: typeof row.department === "object" && row.department ? String((row.department as Row)._id) : String(row.department) }))}
        departments={data.departments.map((row) => ({ _id: row._id, code: String(row.code), name: String(row.name) }))}
        rooms={data.rooms.map((row) => ({ _id: row._id, code: String(row.code), name: String(row.name) }))}
        onClose={() => setScheduling(false)} onSaved={(message) => { setScheduling(false); setNotice(message); setError(""); void load(); }} />}

      <Dialog open={help} onOpenChange={setHelp}><DialogContent className="dealer-dialog"><DialogTitle>Getting started</DialogTitle><DialogDescription>Everything you do here is saved to the campus database and published to the UNILUS student app in real time.</DialogDescription><div className="help-steps">
        <p><Building2 size={20} /><span><strong>Map the campus</strong>Add rooms and locations with coordinates so students can navigate to them.</span></p>
        <p><CalendarDays size={20} /><span><strong>Publish timetables</strong>Published allocations appear in the student timetable and block conflicting room bookings.</span></p>
        <p><Megaphone size={20} /><span><strong>Announce</strong>Published announcements are delivered to students instantly.</span></p>
        <p><Users size={20} /><span><strong>Approve bookings</strong>Student lecture-room requests wait here until you approve or cancel them.</span></p>
      </div><button className="primary-button" onClick={() => setHelp(false)}>Got it</button></DialogContent></Dialog>
    </div>
  );
}
