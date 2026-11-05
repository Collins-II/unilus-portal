import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mock, test } from "node:test";

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
let addresses = [{ address: "1.1.1.1", family: 4 }];
let responseBody = '{"students":[]}';
let status = 200;
let contentType = "application/json";
let interrupted = false;
let lastOptions;
let requests = 0;
mock.module("server-only", { defaultExport: {} });
mock.module(new URL("../server/http.ts", import.meta.url).href, { namedExports: { HttpError } });
mock.module("node:dns/promises", { namedExports: { lookup: async () => addresses } });
mock.module("node:https", { namedExports: {
  request: (_url, options, onResponse) => {
    requests++;
    lastOptions = options;
    const req = new EventEmitter();
    req.destroy = (error) => { req.emit("error", error); req.emit("close"); };
    req.end = () => {
      queueMicrotask(() => {
        const response = new EventEmitter();
        response.statusCode = status;
        response.headers = { "content-type": contentType };
        response.resume = () => req.emit("close");
        onResponse(response);
        if (status < 200 || status >= 300 || contentType === "text/html") return;
        if (interrupted) response.emit("error", new Error("Connection interrupted"));
        else { response.emit("data", Buffer.from(responseBody)); response.emit("end"); }
        req.emit("close");
      });
    };
    return req;
  },
} });
const { fetchImportData } = await import("./external-fetch.ts");
function reset() {
  addresses = [{ address: "1.1.1.1", family: 4 }];
  responseBody = '{"students":[]}'; status = 200; contentType = "application/json"; interrupted = false;
}

test("fetches JSON using the checked socket address and server-side authentication", async () => {
  reset();
  assert.deepEqual(await fetchImportData("https://provider.example/students", ""), { students: [] });
  assert.equal(lastOptions.headers.Authorization, undefined);
  assert.equal(lastOptions.agent, false);
  const lookupOne = await new Promise((resolve) => lastOptions.lookup("provider.example", {}, (_error, address, family) => resolve({ address, family })));
  assert.deepEqual(lookupOne, { address: "1.1.1.1", family: 4 });
  const lookupAll = await new Promise((resolve) => lastOptions.lookup("provider.example", { all: true }, (_error, address) => resolve(address)));
  assert.deepEqual(lookupAll, addresses);
});
test("rejects mixed public/private DNS responses before opening any socket", async () => {
  reset(); addresses.push({ address: "127.0.0.1", family: 4 });
  const before = requests;
  await assert.rejects(fetchImportData("https://provider.example/students", ""), (error) => error.status === 422);
  assert.equal(requests, before);
});
test("does not follow redirects and surfaces provider failures", async () => {
  for (const code of [302, 401, 403, 500]) {
    reset(); status = code;
    const before = requests;
    await assert.rejects(fetchImportData("https://provider.example/students", ""), (error) => error.status === 502);
    assert.equal(requests, before + 1);
  }
});
test("rejects non-JSON, malformed JSON and interrupted responses", async () => {
  reset(); contentType = "text/html";
  await assert.rejects(fetchImportData("https://provider.example/students", ""), /application\/json/);
  reset(); responseBody = "{";
  await assert.rejects(fetchImportData("https://provider.example/students", ""), /invalid JSON/);
  reset(); interrupted = true;
  await assert.rejects(fetchImportData("https://provider.example/students", ""), /interrupted/);
});
test("accepts exactly 2 MiB and rejects larger responses without truncating", async () => {
  reset(); responseBody = `"${"a".repeat(2 * 1024 * 1024 - 2)}"`;
  assert.equal((await fetchImportData("https://provider.example/students", "")).length, 2 * 1024 * 1024 - 2);
  responseBody = `"${"a".repeat(2 * 1024 * 1024 - 1)}"`;
  await assert.rejects(fetchImportData("https://provider.example/students", ""), (error) => error.status === 422);
});
