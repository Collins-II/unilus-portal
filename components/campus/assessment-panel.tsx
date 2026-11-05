"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/client/api";

type Reference = { _id: string; code: string; name?: string; title?: string; department?: { _id: string } | string };
type Question = { prompt: string; options: string[]; correctOption: number; points: number };
type AssessmentForm = {
  _id?: string; title: string; kind: "quiz" | "test" | "exam"; mode: "in_person" | "online";
  course: string; programme: string; year: string; cohort: string; lecturer: string; room: string | null;
  classSize: number; startTime: string; endTime: string; durationMinutes: number;
  status: "draft" | "published"; instructions: string; questions: Question[];
};
type Result = { _id: string; assessment: string; student: { studentId: string; name: string } | null; score: number; maximum: number };
const blank = (): AssessmentForm => ({ title: "", kind: "quiz", mode: "online", course: "", programme: "", year: "", cohort: "", lecturer: "", room: null, classSize: 1, startTime: "", endTime: "", durationMinutes: 30, status: "draft", instructions: "", questions: [{ prompt: "", options: ["", ""], correctOption: 0, points: 1 }] });
const localTime = (value: string) => value ? new Date(new Date(value).getTime() + 7200000).toISOString().slice(0, 16) : "";
const displayTime = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Africa/Lusaka" });

export function AssessmentPanel() {
  const [records, setRecords] = useState<AssessmentForm[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [references, setReferences] = useState<{ courses: Reference[]; programmes: Reference[]; rooms: Reference[]; staff: { role: string } } | null>(null);
  const [form, setForm] = useState<AssessmentForm | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [data, refs] = await Promise.all([api<{ records: AssessmentForm[]; results: Result[] }>("/api/campus/assessments"), api<NonNullable<typeof references>>("/api/campus")]);
      setRecords(data.records); setResults(data.results); setReferences(refs); setError("");
    } catch (error) { setError(errorMessage(error)); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const update = <K extends keyof AssessmentForm>(key: K, value: AssessmentForm[K]) => setForm((current) => current ? { ...current, [key]: value } : null);
  const updateQuestion = (index: number, question: Question) => update("questions", form!.questions.map((current, i) => i === index ? question : current));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true); setError("");
    try {
      const body = { ...form, startTime: new Date(`${form.startTime}:00+02:00`).toISOString(), endTime: new Date(`${form.endTime}:00+02:00`).toISOString() };
      await api("/api/campus/assessments", { method: form._id ? "PATCH" : "POST", body });
      setForm(null); await load();
    } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  };
  return <section className="dealer-panel p-5">
    <div className="panel-heading"><div><h1>Quizzes, tests & exams</h1><p>Programme/year audiences, Lusaka scheduling and timed online multiple-choice attempts. Results are released to students after the window closes.</p></div>{references?.staff.role === "admin" && <button className="primary-button" onClick={() => setForm(blank())} disabled={busy}>New assessment</button>}</div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!references && !error && <p role="status">Loading assessment workspace...</p>}
    {form && <form onSubmit={save} className="space-y-4">
      {!references?.programmes.length && <p role="alert">Configure a study programme in the campus workspace before saving an assessment.</p>}
      <fieldset disabled={busy} className="campus-form-grid">
        <label className="form-field"><span>Title</span><input required maxLength={160} value={form.title} onChange={(event) => update("title", event.target.value)} /></label>
        <label className="form-field"><span>Kind</span><select value={form.kind} onChange={(event) => update("kind", event.target.value as AssessmentForm["kind"])}>{["quiz", "test", "exam"].map((kind) => <option key={kind}>{kind}</option>)}</select></label>
        <label className="form-field"><span>Delivery</span><select value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value as AssessmentForm["mode"], room: null, questions: event.target.value === "online" ? blank().questions : [] })}><option value="online">Online, automatically marked</option><option value="in_person">Scheduled in person</option></select></label>
        <label className="form-field"><span>Study programme</span><select required value={form.programme} onChange={(event) => update("programme", event.target.value)}><option value="">Select programme</option>{references?.programmes.map((programme) => <option key={programme._id} value={programme.code}>{programme.name}</option>)}</select></label>
        <label className="form-field"><span>Course</span><select required value={form.course} onChange={(event) => update("course", event.target.value)}><option value="">Select course</option>{references?.courses.map((course) => <option key={course._id} value={course._id}>{course.code} - {course.title}</option>)}</select></label>
        {(["year", "cohort", "lecturer"] as const).map((key) => <label key={key} className="form-field"><span>{key === "year" ? "Student year (exact profile value)" : key === "cohort" ? "Timetable cohort (exact allocation value)" : "Lecturer (exact timetable name)"}</span><input required value={form[key]} onChange={(event) => update(key, event.target.value)} /></label>)}
        <label className="form-field"><span>Opens / starts (Africa/Lusaka)</span><input type="datetime-local" required value={form.startTime} onChange={(event) => update("startTime", event.target.value)} /></label>
        <label className="form-field"><span>Closes / ends (Africa/Lusaka)</span><input type="datetime-local" required value={form.endTime} onChange={(event) => update("endTime", event.target.value)} /></label>
        <label className="form-field"><span>Attempt duration (minutes)</span><input type="number" min={1} max={240} required value={form.durationMinutes} onChange={(event) => update("durationMinutes", Number(event.target.value))} /></label>
        <label className="form-field"><span>Class size</span><input type="number" min={1} max={10000} required value={form.classSize} onChange={(event) => update("classSize", Number(event.target.value))} /></label>
        {form.mode === "in_person" && <label className="form-field"><span>Verified teaching room</span><select required value={form.room ?? ""} onChange={(event) => update("room", event.target.value)}><option value="">Select room</option>{references?.rooms.map((room) => <option key={room._id} value={room._id}>{room.code} - {room.name}</option>)}</select></label>}
        <label className="form-field"><span>Visibility</span><select value={form.status} onChange={(event) => update("status", event.target.value as AssessmentForm["status"])}><option value="draft">Draft</option><option value="published">Published</option></select></label>
        <label className="form-field full-width"><span>Instructions</span><textarea value={form.instructions} onChange={(event) => update("instructions", event.target.value)} /></label>
      </fieldset>
      {form.mode === "online" && <fieldset disabled={busy} className="space-y-4">
        <legend>Multiple-choice questions</legend>
        {form.questions.map((question, index) => <div className="rounded-xl border p-4 space-y-2" key={index}>
          <label className="form-field"><span>Question {index + 1}</span><textarea required value={question.prompt} onChange={(event) => updateQuestion(index, { ...question, prompt: event.target.value })} /></label>
          {question.options.map((option, i) => <label key={i} className="form-field"><span>Option {i + 1}</span><input required value={option} onChange={(event) => updateQuestion(index, { ...question, options: question.options.map((value, j) => i === j ? event.target.value : value) })} /></label>)}
          <label className="form-field"><span>Correct option</span><select value={question.correctOption} onChange={(event) => updateQuestion(index, { ...question, correctOption: Number(event.target.value) })}>{question.options.map((_, i) => <option key={i} value={i}>Option {i + 1}</option>)}</select></label>
          <label className="form-field"><span>Points</span><input type="number" min={1} max={100} required value={question.points} onChange={(event) => updateQuestion(index, { ...question, points: Number(event.target.value) })} /></label>
          <button type="button" className="secondary-button" disabled={question.options.length >= 6} onClick={() => updateQuestion(index, { ...question, options: [...question.options, ""] })}>Add option</button>
          <button type="button" className="secondary-button" disabled={form.questions.length <= 1} onClick={() => update("questions", form.questions.filter((_, i) => i !== index))}>Remove question</button>
        </div>)}
        <button type="button" className="secondary-button" disabled={form.questions.length >= 100} onClick={() => update("questions", [...form.questions, blank().questions[0]])}>Add question</button>
      </fieldset>}
      <div className="dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setForm(null)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving..." : "Save assessment"}</button></div>
    </form>}
    <div className="space-y-3">{records.map((record) => <article key={record._id} className="rounded-xl border p-4">
      <h2 className="font-bold">{record.title}</h2><p>{record.kind} / {record.mode} / {record.status} - {record.programme}, year {record.year}</p>
      <p>{displayTime(record.startTime)} - {displayTime(record.endTime)} (Lusaka)</p>
      {references?.staff.role === "admin" && <button className="secondary-button" disabled={busy} onClick={() => setForm({ _id: record._id, title: record.title, kind: record.kind, mode: record.mode, course: record.course, programme: record.programme, year: record.year, cohort: record.cohort, lecturer: record.lecturer, room: record.room, classSize: record.classSize, startTime: localTime(record.startTime), endTime: localTime(record.endTime), durationMinutes: record.durationMinutes, status: record.status, instructions: record.instructions, questions: record.questions.map(({ prompt, options, correctOption, points }) => ({ prompt, options, correctOption, points })) })}>Edit / publish</button>}
      {results.filter((result) => result.assessment === record._id).map((result) => <p key={result._id}>{result.student?.studentId} {result.student?.name}: {result.score}/{result.maximum}</p>)}
    </article>)}</div>
    {references && !records.length && <p>No assessments yet. Configure the programme catalogue before creating an assessment.</p>}
    <button className="secondary-button" onClick={() => void load()} disabled={busy}>Refresh assessments & results</button>
  </section>;
}
