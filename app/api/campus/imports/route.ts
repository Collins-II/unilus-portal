import { z } from "zod";
import { requireStaff } from "@/lib/server/auth";
import { handler, HttpError, rateLimit, readJson } from "@/lib/server/http";
import { objectId } from "@/lib/campus/policy";
import { importRequest, mapImportRecords } from "@/lib/campus/import-policy";
import { fetchImportData } from "@/lib/campus/external-fetch";
import { commitImport, previewImport } from "@/lib/campus/import-service";

export const runtime = "nodejs";
export const POST = handler(async (request: Request) => {
  const staff = await requireStaff("admin");
  rateLimit(`campus-import:${staff.id}`, 20, 60_000);
  const input = importRequest.parse(await readJson(request));
  const payload = await fetchImportData(input.url, input.token);
  let rows;
  try { rows = mapImportRecords(payload, input); }
  catch (error) { throw new HttpError(422, error instanceof Error ? error.message : "Invalid import records."); }
  return previewImport(staff.id, rows, input.updateExisting);
});

export const PATCH = handler(async (request: Request) => {
  const staff = await requireStaff("admin");
  rateLimit(`campus-import-commit:${staff.id}`, 20, 60_000);
  const { previewId } = z.object({ previewId: objectId }).strict().parse(await readJson(request));
  return commitImport(staff.id, previewId);
});
