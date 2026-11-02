"use client";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** JSON fetch helper for the portal's own API. Redirects to sign-in when the session has expired. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? (init.body !== undefined || init.form ? "POST" : "GET"),
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    cache: "no-store",
    credentials: "same-origin",
  }).catch(() => {
    throw new ApiError(0, "You appear to be offline. Check your connection and try again.");
  });
  const payload = await response.json().catch(() => null);
  if (response.status === 401 && typeof window !== "undefined") {
    window.location.href = `/login?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
  if (!response.ok) throw new ApiError(response.status, payload?.error ?? "Something went wrong. Please try again.");
  return payload as T;
}

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong. Please try again.");

/** Downloads rows as a CSV file. Cells that could be interpreted as formulas are escaped. */
export function exportCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map((value) => {
    const text = String(value ?? "");
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
