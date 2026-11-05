"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/client/api";
import { campuses, type CampusId } from "@/lib/campus/geography";
import { teachingTypes, type ScheduleInput, type ScheduleResult } from "@/lib/campus/scheduler";

type Option = { _id: string; code: string; name?: string; title?: string; department?: { _id: string } | string };
type Demand = ScheduleInput["demands"][number];
type Preview = ScheduleResult & { previewId: string; expiresAt: string };
type Props = { campusId: CampusId; courses: Option[]; departments: Option[]; rooms: Option[]; onClose: () => void; onSaved: (message: string) => void };
export function ScheduleDialog({ campusId, courses, departments, rooms, onClose, onSaved }: Props) {
  const empty = (): Demand => ({ course: "", department: "", cohort: "", lecturer: "", campus: campusId, classSize: 30, weeklySessions: 2, durationMinutes: 60, roomType: "lecture_room", equipment: [] });
  const [academicYear, setAcademicYear] = useState(String(new Date().getFullYear()));
  const [semester, setSemester] = useState("1");
  const [demands, setDemands] = useState<Demand[]>([empty()]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [allowPartial, setAllowPartial] = useState(false);
  const label = (records: Option[], id: string) => { const record = records.find((record) => record._id === id); return record ? `${record.code} - ${record.title || record.name || ""}` : id; };
  function change(index: number, value: Partial<Demand>) {
    setDemands((rows) => rows.map((row, i) => i === index ? { ...row, ...value } : row));
  }
  async function generate(event: React.FormEvent) {
    event.preventDefault(); setWorking(true); setError(""); setAllowPartial(false);
    try { setPreview(await api<Preview>("/api/campus/auto-allocate", { body: { academicYear, semester, demands: demands.map((demand) => ({ ...demand, equipment: demand.equipment.map((item) => item.trim()).filter(Boolean) })) } })); }
    catch (error) { setError(errorMessage(error)); }
    finally { setWorking(false); }
  }
  async function save() {
    if (!preview) return;
    setWorking(true); setError("");
    try {
      const result = await api<{ created: number }>("/api/campus/auto-allocate", { method: "PATCH", body: { previewId: preview.previewId, allowPartial } });
      onSaved(`${result.created} smart allocations saved as drafts. Review and publish individually; no existing allocations or bookings were changed.`);
    } catch (error) { setError(errorMessage(error)); }
    finally { setWorking(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !working) onClose(); }}>
    <DialogContent className="dealer-dialog record-dialog campus-import-dialog" showCloseButton={!working}
      onEscapeKeyDown={(event) => { if (working) event.preventDefault(); }} onInteractOutside={(event) => { if (working) event.preventDefault(); }}>
      <DialogTitle>Smart timetable allocation</DialogTitle>
      <DialogDescription>Plan across UNILUS campuses with capacity, equipment, cohort, lecturer and travel constraints. Preview first; save drafts without replacing existing records.</DialogDescription>
      {!preview ? <form onSubmit={generate}>
        <fieldset disabled={working}>
          <div className="campus-form-grid">
            <label className="form-field"><span>Academic year</span><input required value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} maxLength={30} /></label>
            <label className="form-field"><span>Semester</span><input required value={semester} onChange={(event) => setSemester(event.target.value)} maxLength={30} /></label>
          </div>
          <p className="campus-info">Monday-Friday, 08:00-17:00; lunch 12:00-13:00; 30-minute slots. Enter only new sessions not already scheduled. Sessions spread across different days. Walking estimate: 1.4x straight-line distance at 1.2 m/s plus a 5-minute changeover. Cross-campus movement needs the full estimated transfer time.</p>
          {demands.map((demand, index) => <section className="schedule-demand" key={index}>
            <div className="panel-heading"><strong>Teaching requirement {index + 1}</strong><button type="button" className="text-link" disabled={demands.length === 1} onClick={() => setDemands(demands.filter((_, i) => i !== index))}>Remove</button></div>
            <div className="campus-form-grid">
              <label className="form-field"><span>Department</span><select aria-label="Department" required value={demand.department} onChange={(event) => change(index, { department: event.target.value, course: "" })}><option value="">Select department</option>{departments.map((row) => <option key={row._id} value={row._id}>{label(departments, row._id)}</option>)}</select></label>
              <label className="form-field"><span>Course</span><select aria-label="Course" required value={demand.course} onChange={(event) => change(index, { course: event.target.value })}><option value="">Select course</option>{courses.filter((row) => (typeof row.department === "object" ? row.department._id : row.department) === demand.department).map((row) => <option key={row._id} value={row._id}>{label(courses, row._id)}</option>)}</select></label>
              <label className="form-field"><span>Cohort / teaching group</span><input required maxLength={100} value={demand.cohort} onChange={(event) => change(index, { cohort: event.target.value })} placeholder="Use the same identifier for students attending together" /></label>
              <label className="form-field"><span>Lecturer identifier</span><input required maxLength={120} value={demand.lecturer} onChange={(event) => change(index, { lecturer: event.target.value })} placeholder="Use a consistent name or staff identifier" /></label>
              <label className="form-field"><span>Campus</span><select aria-label="Campus" value={demand.campus} onChange={(event) => change(index, { campus: event.target.value as CampusId })}>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>
              <label className="form-field"><span>Room type</span><select aria-label="Room type" value={demand.roomType} onChange={(event) => change(index, { roomType: event.target.value as Demand["roomType"] })}>{teachingTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
              <label className="form-field"><span>Class size</span><input required type="number" min={1} max={10000} value={demand.classSize} onChange={(event) => change(index, { classSize: Number(event.target.value) })} /></label>
              <label className="form-field"><span>New sessions per week</span><input required type="number" min={1} max={5} value={demand.weeklySessions} onChange={(event) => change(index, { weeklySessions: Number(event.target.value) })} /></label>
              <label className="form-field"><span>Session duration (minutes)</span><input required type="number" min={30} max={240} step={30} value={demand.durationMinutes} onChange={(event) => change(index, { durationMinutes: Number(event.target.value) })} /></label>
              <label className="form-field"><span>Required equipment (comma separated)</span><input value={demand.equipment.join(",")} onChange={(event) => change(index, { equipment: event.target.value.split(",") })} /></label>
            </div>
          </section>)}
          <button type="button" className="secondary-button" disabled={demands.length >= 40} onClick={() => setDemands([...demands, empty()])}>+ Add teaching requirement</button>
          <p className="import-policy-note">Up to 40 requirements / 80 sessions per preview. Only existing campus-mapped rooms are used. Insufficient or unverified room data is reported, never filled with invented rooms.</p>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button type="button" className="secondary-button" disabled={working} onClick={onClose}>Cancel</button><button className="primary-button" disabled={working}>{working ? "Planning..." : "Generate preview"}</button></div>
      </form> : <>
        <div className="import-summary" role="status"><strong>{preview.metrics.scheduled}/{preview.metrics.requested} sessions allocated</strong><strong>{preview.metrics.roomUtilisationPercent}% seat utilisation</strong><strong>{preview.metrics.estimatedWalkingMinutes} estimated cohort/lecturer walking minutes</strong></div>
        {preview.warnings.map((warning) => <p className="import-policy-note" key={warning}>{warning}</p>)}
        <p>Preview expires at {new Date(preview.expiresAt).toLocaleTimeString()}. Campus changes require a fresh preview.</p>
        <div className="table-scroll import-preview"><table><thead><tr><th>Course</th><th>Cohort / lecturer</th><th>Campus / room</th><th>Day</th><th>Time</th><th>Class size</th></tr></thead><tbody>
          {preview.allocations.map((row) => <tr key={`${row.demandIndex}:${row.sessionNumber}`}><td>{label(courses, row.course)}</td><td>{row.cohort}<br />{row.lecturer}</td><td>{campuses.find((campus) => campus.id === demands[row.demandIndex].campus)?.name}<br />{label(rooms, row.room)}</td><td>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][row.dayOfWeek]}</td><td>{row.startTime}-{row.endTime}</td><td>{row.classSize}</td></tr>)}
        </tbody></table></div>
        {preview.unscheduled.length > 0 && <section role="alert"><h3>Unallocated sessions</h3><ul>{preview.unscheduled.map((row) => <li key={`${row.demandIndex}:${row.sessionNumber}`}>{label(courses, demands[row.demandIndex].course)}, session {row.sessionNumber}: {row.reason}</li>)}</ul>
          <label className="import-checkbox"><input type="checkbox" disabled={working} checked={allowPartial} onChange={(event) => setAllowPartial(event.target.checked)} /><span>I accept a partial draft and will resolve the unallocated sessions.</span></label></section>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button className="secondary-button" disabled={working} onClick={() => { setPreview(null); setError(""); }}>Revise requirements</button><button className="primary-button" disabled={working || !preview.allocations.length || (preview.unscheduled.length > 0 && !allowPartial)} onClick={() => void save()}>{working ? "Saving..." : "Save allocations as drafts"}</button></div>
      </>}
    </DialogContent>
  </Dialog>;
}
