"use client";

import { ActiveTrackingProvider } from "./active-tracking-provider";
import { ActiveTrackingBar } from "./ActiveTrackingBar";

export function AgentTrackingShell({ children }: { children: React.ReactNode }) {
  return (
    <ActiveTrackingProvider>
      {children}
      <ActiveTrackingBar />
    </ActiveTrackingProvider>
  );
}
