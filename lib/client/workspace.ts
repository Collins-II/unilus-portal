"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { WorkspaceData } from "@/lib/domain";
import { api, errorMessage } from "./api";

type State = { data: WorkspaceData | null; error: string; loading: boolean };

let state: State = { data: null, error: "", loading: false };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const SERVER_STATE: State = { data: null, error: "", loading: true };

function setState(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

/** Fetches the latest workspace snapshot. Concurrent calls share one request. */
export function refreshWorkspace() {
  if (inflight) return inflight;
  setState({ loading: true });
  inflight = api<WorkspaceData>("/api/workspace")
    .then((data) => setState({ data, error: "", loading: false }))
    .catch((error) => setState({ error: errorMessage(error), loading: false }))
    .finally(() => { inflight = null; });
  return inflight;
}

/** Runs a mutation, then refreshes the workspace so every view reflects the server state. */
export async function mutate<T>(request: () => Promise<T>) {
  const result = await request();
  await refreshWorkspace();
  return result;
}

const POLL_MS = 30_000;

export function useWorkspace() {
  const snapshot = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => state,
    () => SERVER_STATE,
  );
  useEffect(() => {
    if (!state.data && !inflight) void refreshWorkspace();
    const onVisible = () => { if (document.visibilityState === "visible") void refreshWorkspace(); };
    const timer = window.setInterval(onVisible, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  return snapshot;
}
