import { z } from "zod";
import { code, resourceSchemas } from "./policy.ts";

export const MAX_IMPORT_RECORDS = 500;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const importResource = z.enum(["students", "courses"]);
export type ImportResource = z.infer<typeof importResource>;
const path = z.string().trim().max(160).refine(
  (value) => !value || value.split(".").every((part) => /^[A-Za-z0-9_-]+$/.test(part) && !["__proto__", "prototype", "constructor"].includes(part)),
  "Use dot-separated field names, without prototype properties.",
);
export const importRequest = z.object({
  resource: importResource,
  url: z.url().max(2000),
  token: z.string().trim().max(2000).regex(/^[^\r\n]*$/).default(""),
  recordsPath: path.default(""),
  mapping: z.record(z.string(), path),
  updateExisting: z.boolean().default(false),
}).strict();
export const importStudent = resourceSchemas.students.pick({ studentId: true, name: true, email: true }).extend({
  department: resourceSchemas.students.shape.department.removeDefault().optional(),
  program: resourceSchemas.students.shape.program.removeDefault().optional(),
  year: resourceSchemas.students.shape.year.removeDefault().optional(),
  phone: resourceSchemas.students.shape.phone.removeDefault().optional(),
});
export const importCourse = resourceSchemas.courses.extend({ department: code });
export const importRows = z.discriminatedUnion("resource", [
  z.object({ resource: z.literal("students"), rows: z.array(importStudent).min(1).max(MAX_IMPORT_RECORDS) }),
  z.object({ resource: z.literal("courses"), rows: z.array(importCourse).min(1).max(MAX_IMPORT_RECORDS) }),
]);
export type ImportedRows = z.infer<typeof importRows>;
export type ImportMappingField = { key: string; label: string; required: boolean };
export const importFields: Record<ImportResource, ImportMappingField[]> = {
  students: [
    { key: "studentId", label: "Student ID", required: true },
    { key: "name", label: "Full name", required: true },
    { key: "email", label: "Email", required: true },
    { key: "department", label: "Department", required: false },
    { key: "program", label: "Program", required: false },
    { key: "year", label: "Year", required: false },
    { key: "phone", label: "Phone", required: false },
  ],
  courses: [
    { key: "code", label: "Course code", required: true },
    { key: "title", label: "Course title", required: true },
    { key: "department", label: "Existing department code", required: true },
  ],
};

export function valueAtPath(value: unknown, fieldPath: string): unknown {
  if (!fieldPath) return value;
  let current = value;
  for (const part of fieldPath.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !Object.hasOwn(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function mapImportRecords(payload: unknown, input: z.infer<typeof importRequest>): ImportedRows {
  const records = valueAtPath(payload, input.recordsPath);
  if (!Array.isArray(records) || !records.length) throw new Error("The records path must point to a non-empty JSON array.");
  if (records.length > MAX_IMPORT_RECORDS) throw new Error(`Import at most ${MAX_IMPORT_RECORDS} records per batch. Use the provider's pagination to import another page.`);
  const supported = importFields[input.resource];
  if (Object.keys(input.mapping).some((key) => !supported.some((field) => field.key === key))) throw new Error("The mapping contains an unsupported field.");
  for (const field of supported) {
    if (field.required && !input.mapping[field.key]) throw new Error(`Map the ${field.label} field.`);
  }
  const schema = input.resource === "students" ? importStudent : importCourse;
  const identities = new Set<string>();
  const emails = new Set<string>();
  const rows = records.map((record, index) => {
    const mapped: Record<string, unknown> = {};
    for (const field of supported) {
      const source = input.mapping[field.key];
      if (!source) continue;
      const value = valueAtPath(record, source);
      if (value === undefined || value === null) continue;
      if (typeof value !== "string" && typeof value !== "number") throw new Error(`Row ${index + 1}: ${field.label} must be text or a number.`);
      mapped[field.key] = String(value).trim();
    }
    const result = schema.safeParse(mapped);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new Error(`Row ${index + 1}: ${issue.path.join(".") || "record"}: ${issue.message}`);
    }
    const row = result.data;
    const identity = "studentId" in row ? row.studentId : row.code;
    if (identities.has(identity)) throw new Error(`Row ${index + 1}: duplicate identifier ${identity}.`);
    identities.add(identity);
    if ("email" in row) {
      if (emails.has(row.email)) throw new Error(`Row ${index + 1}: duplicate email ${row.email}.`);
      emails.add(row.email);
    }
    return row;
  });
  return importRows.parse({ resource: input.resource, rows });
}
