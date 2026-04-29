"use client";

import { AppStateProvider } from "@/lib/app-state";

export function AppProviders({ children }) {
  return <AppStateProvider>{children}</AppStateProvider>;
}
