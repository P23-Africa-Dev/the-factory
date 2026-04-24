"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { AgentView } from "@/components/operations/agent-view";
import { AttendanceView } from "@/components/operations/attendance-view";

type WorkforceTab = "agent" | "attendance";

const TABS: { value: WorkforceTab; label: string }[] = [
  { value: "agent", label: "Agents" },
  { value: "attendance", label: "Attendance" },
];

// ─── Page content ─────────────────────────────────────────────────────────────
function OperationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const activeTab = (searchParams.get("tab") as WorkforceTab) || "agent";

  const handleTabChange = (tab: WorkforceTab) => {
    const params = new URLSearchParams(searchParams.toString());
    tab === "agent" ? params.delete("tab") : params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="max-w-400 mx-auto flex flex-col gap-5">
        {/* ── Tabs ── */}
        <div className="flex items-center gap-4 relative z-20">
          <div className="flex gap-1 bg-white rounded-full p-1.5 border border-gray-100 shadow-sm">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => handleTabChange(tab.value)}
                className={`px-5 py-2.5 rounded-full transition-all cursor-pointer ${
                  activeTab === tab.value
                    ? "bg-[#09232D] text-white shadow-lg text-[14px] font-extrabold"
                    : "text-gray-400 hover:text-gray-600 text-[13px] font-medium"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── View ── */}
        {activeTab === "agent" ? <AgentView /> : <AttendanceView />}
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
