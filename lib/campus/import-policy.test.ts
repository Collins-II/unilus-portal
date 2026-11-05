import assert from "node:assert/strict";
import { test } from "node:test";
import { importRequest, mapImportRecords, MAX_IMPORT_RECORDS, valueAtPath } from "./import-policy.ts";
import { externalUrl, isPublicAddress } from "./external-url.ts";

const studentInput = importRequest.parse({
  resource: "students", url: "https://provider.example/students", recordsPath: "data.records",
  mapping: { studentId: "id", name: "profile.name", email: "email" },
});
const record = { id: "s001", profile: { name: "Test Student" }, email: "TEST@example.invalid" };

test("maps nested API records, normalizes IDs/emails and preserves absent optional fields", () => {
  const result = mapImportRecords({ data: { records: [record] } }, studentInput);
  assert.deepEqual(result, { resource: "students", rows: [{ studentId: "S001", name: "Test Student", email: "test@example.invalid" }] });
  assert.equal("password" in result.rows[0], false);
  assert.equal("status" in result.rows[0], false);
  assert.equal("department" in result.rows[0], false);
});
test("ignores provider passwords, roles and activation statuses", () => {
  const result = mapImportRecords({ data: { records: [{ ...record, password: "external", role: "admin", status: "active" }] } }, studentInput);
  assert.deepEqual(Object.keys(result.rows[0]).sort(), ["email", "name", "studentId"]);
  assert.throws(() => mapImportRecords([], { ...studentInput, mapping: { ...studentInput.mapping, password: "password" } }));
});
test("rejects missing arrays, malformed rows, missing mappings and non-scalar values", () => {
  for (const records of [[], [null], [{ ...record, email: "not-an-email" }], [{ ...record, id: {} }]]) {
    assert.throws(() => mapImportRecords({ data: { records } }, studentInput));
  }
  assert.throws(() => mapImportRecords({ data: { records: [record] } }, { ...studentInput, mapping: { email: "email" } }), /Map the Student ID/);
  assert.throws(() => mapImportRecords({ data: {} }, studentInput), /non-empty JSON array/);
});
test("rejects duplicate IDs and duplicate normalized emails within a batch", () => {
  assert.throws(() => mapImportRecords({ data: { records: [record, { ...record, id: "S001" }] } }, studentInput), /duplicate identifier/);
  assert.throws(() => mapImportRecords({ data: { records: [record, { ...record, id: "S002" }] } }, studentInput), /duplicate email/);
});
test("enforces the exact 500-record limit without truncating data", () => {
  const records = Array.from({ length: MAX_IMPORT_RECORDS }, (_, index) => ({ ...record, id: `S${index}`, email: `test-${index}@example.invalid` }));
  assert.equal(mapImportRecords({ data: { records } }, studentInput).rows.length, 500);
  assert.throws(() => mapImportRecords({ data: { records: [...records, { ...record, id: "extra" }] } }, studentInput), /at most 500/);
});
test("maps courses by existing department codes and supports numeric provider IDs", () => {
  const input = importRequest.parse({ resource: "courses", url: "https://provider.example/courses", mapping: { code: "id", title: "name", department: "school.code" } });
  assert.deepEqual(mapImportRecords([{ id: 101, name: "Computing", school: { code: "cs" } }], input), { resource: "courses", rows: [{ code: "101", title: "Computing", department: "CS" }] });
});
test("blocks prototype traversal and unexpected mapping/configuration fields", () => {
  assert.equal(valueAtPath({}, "constructor"), undefined);
  for (const mapping of [{ name: "__proto__.name" }, { name: "constructor.name" }, { name: "profile[0].name" }]) {
    assert.equal(importRequest.safeParse({ ...studentInput, mapping }).success, false);
  }
  assert.equal(importRequest.safeParse({ ...studentInput, token: "token\r\nX-Injected: true" }).success, false);
  assert.equal(importRequest.safeParse({ ...studentInput, extra: true }).success, false);
});
test("only accepts HTTPS public endpoints without embedded credentials, fragments or alternate ports", () => {
  assert.equal(externalUrl("https://provider.example/api/students?page=2").hostname, "provider.example");
  for (const url of ["http://provider.example", "file:///secret", "https://user:pass@provider.example", "https://provider.example:8443", "https://provider.example/#token", "https://localhost", "https://campus.local", "https://127.1", "https://2130706433", "https://169.254.169.254", "https://[::1]"]) assert.throws(() => externalUrl(url), url);
});
test("blocks private, reserved, mapped IPv6 and protocol-assignment addresses", () => {
  for (const address of ["0.0.0.0", "10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.1.1", "172.31.255.255", "192.168.0.1", "100.64.0.1", "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "fe80::1", "fc00::1", "2001:0000::1", "2001:db8::1", "2002:7f00:1::", "3fff::1"]) assert.equal(isPublicAddress(address), false, address);
  for (const address of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2001:4860:4860::8888", "2606:4700:4700::1111"]) assert.equal(isPublicAddress(address), true, address);
});
