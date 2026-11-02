"use client";

import { PreferencesProvider } from "@/lib/client/preferences";

export function Providers({ children }: { children: React.ReactNode }) {
  return <PreferencesProvider>{children}</PreferencesProvider>;
}
