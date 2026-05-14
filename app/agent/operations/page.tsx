"use client";

import { Suspense } from "react";
import { AttendanceViewAgent } from "@/components/operations/attendance-view-agent";

function OperationsContent() {
  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
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
        <div className="min-h-screen bg-[#F4F7F9] p-8 flex items-center justify-center font-bold text-gray-400">
          Loading Operations...
        </div>
      }
    >
      <OperationsContent />
    </Suspense>
  );
}
