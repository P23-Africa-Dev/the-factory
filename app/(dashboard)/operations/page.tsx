"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ProjectsView } from "@/components/operations/projects-view";
import { AgentView } from "@/components/operations/agent-view";
import { AttendanceView } from "@/components/operations/attendance-view";
import type { TaskCategory, Project } from "@/types/operations";

// ─── Mock data (swap for API call later) ─────────────────────────────────────
const MOCK_PROJECTS: Project[] = [
  {
    id: "project-1",
    name: "Product Outreach",
    description:
      "Physical outreach and transforms executive networking from casual connections to strategic growth...",
    deadline: "2 days to Deadline",
    status: "In progress",
    priority: "High",
    completedPercent: 35,
    pendingPercent: 75,
  },
  {
    id: "project-2",
    name: "Product Outreach",
    description:
      "Physical outreach and transforms executive networking from casual connections to strategic growth...",
    deadline: "2 days to Deadline",
    status: "In progress",
    priority: "High",
    completedPercent: 35,
    pendingPercent: 75,
  },
  {
    id: "project-3",
    name: "Product Outreach",
    description:
      "Physical outreach and transforms executive networking from casual connections to strategic growth...",
    deadline: "2 days to Deadline",
    status: "In progress",
    priority: "High",
    completedPercent: 35,
    pendingPercent: 75,
  },
  {
    id: "project-4",
    name: "Product Outreach",
    description:
      "Physical outreach and transforms executive networking from casual connections to strategic growth...",
    deadline: "2 days to Deadline",
    status: "In progress",
    priority: "High",
    completedPercent: 35,
    pendingPercent: 75,
  },
  {
    id: "project-5",
    name: "Product Outreach",
    description:
      "Physical outreach and transforms executive networking from casual connections to strategic growth...",
    deadline: "2 days to Deadline",
    status: "In progress",
    priority: "High",
    completedPercent: 35,
    pendingPercent: 75,
  },
  {
    id: "project-6",
    name: "Product Outreach",
    description:
      "Physical outreach and transforms executive networking from casual connections to strategic growth...",
    deadline: "2 days to Deadline",
    status: "In progress",
    priority: "High",
    completedPercent: 35,
    pendingPercent: 75,
  },
  {
    id: "project-7",
    name: "Product Outreach",
    description:
      "Physical outreach and transforms executive networking from casual connections to strategic growth...",
    deadline: "2 days to Deadline",
    status: "In progress",
    priority: "High",
    completedPercent: 35,
    pendingPercent: 75,
  },
  {
    id: "project-8",
    name: "Product Outreach",
    description:
      "Physical outreach and transforms executive networking from casual connections to strategic growth...",
    deadline: "2 days to Deadline",
    status: "In progress",
    priority: "High",
    completedPercent: 35,
    pendingPercent: 75,
  },
  {
    id: "project-9",
    name: "Product Outreach",
    description:
      "Physical outreach and transforms executive networking from casual connections to strategic growth...",
    deadline: "2 days to Deadline",
    status: "In progress",
    priority: "High",
    completedPercent: 35,
    pendingPercent: 75,
  },
  {
    id: "project-10",
    name: "Product Outreach",
    description:
      "Physical outreach and transforms executive networking from casual connections to strategic growth...",
    deadline: "2 days to Deadline",
    status: "In progress",
    priority: "High",
    completedPercent: 35,
    pendingPercent: 75,
  },
];

const TABS: { value: TaskCategory; label: string }[] = [
  { value: "all", label: "All Project" },
  { value: "agent", label: "Agents" },
  { value: "attendance", label: "Attendance" },
];

// ─── Page content ─────────────────────────────────────────────────────────────
function OperationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const activeTab = (searchParams.get("tab") as TaskCategory) || "all";

  const handleTabChange = (tab: TaskCategory) => {
    const params = new URLSearchParams(searchParams.toString());
    tab === "all" ? params.delete("tab") : params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  // Navigate to dedicated project tasks page
  const handleViewProject = (id: string) => {
    router.push(`/operations/${id}`);
  };

  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="max-w-400 mx-auto flex flex-col gap-5">
        {/* ── Tabs ── */}
        <div className="flex items-center gap-4">
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
        {activeTab === "all" ? (
          <ProjectsView
            projects={MOCK_PROJECTS}
            onViewProject={handleViewProject}
          />
        ) : activeTab === "agent" ? (
          <AgentView />
        ) : (
          <AttendanceView />
        )}
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
