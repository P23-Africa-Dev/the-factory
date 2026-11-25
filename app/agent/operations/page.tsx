"use client";

import { Suspense } from "react";
import { AttendanceViewAgent } from "@/components/operations/attendance-view-agent";

function OperationsContent() {
  return (
    <div className="app-workspace-bg min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-400 mx-auto flex flex-col gap-5">
        <AttendanceViewAgent />
      </div>
    </div>
  );
}

export default function OperationsPage() {
  return (
    <Suspense
      fallback={
        <div className="app-workspace-bg min-h-screen p-8 flex items-center justify-center font-bold text-white/60">
          Loading Operations...
        </div>
      }
    >
      <OperationsContent />
    </Suspense>
  );
}
