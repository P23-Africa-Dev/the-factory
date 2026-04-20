"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ProjectsView } from "@/components/operations/projects-view";
import { AllTasksView } from "@/components/operations/all-tasks-view";
import type { Project } from "@/types/operations";

// ─── Mock data (swap for API call later) ─────────────────────────────────────
const MOCK_PROJECTS: Project[] = [
  { id: "project-1",  name: "Product Outreach", description: "Physical outreach and transforms executive networking from casual connections to strategic growth...", deadline: "2 days to Deadline",  status: "Completed",   priority: "High",   completedPercent: 100, pendingPercent: 0  },
  { id: "project-2",  name: "Product Outreach", description: "Physical outreach and transforms executive networking from casual connections to strategic growth...", deadline: "2 days to Deadline",  status: "Completed",   priority: "High",   completedPercent: 100, pendingPercent: 0  },
  { id: "project-3",  name: "Product Outreach", description: "Physical outreach and transforms executive networking from casual connections to strategic growth...", deadline: "4 days to Deadline",  status: "Completed",   priority: "Medium", completedPercent: 100, pendingPercent: 0  },
  { id: "project-4",  name: "Product Outreach", description: "Physical outreach and transforms executive networking from casual connections to strategic growth...", deadline: "1 week to Deadline",  status: "Completed",   priority: "Low",    completedPercent: 100, pendingPercent: 0  },
  { id: "project-5",  name: "Product Outreach", description: "Physical outreach and transforms executive networking from casual connections to strategic growth...", deadline: "3 days to Deadline",  status: "Completed",   priority: "High",   completedPercent: 100, pendingPercent: 0  },
  { id: "project-6",  name: "Product Outreach", description: "Physical outreach and transforms executive networking from casual connections to strategic growth...", deadline: "5 days to Deadline",  status: "Completed",   priority: "Medium", completedPercent: 100, pendingPercent: 0  },
  { id: "project-7",  name: "Product Outreach", description: "Physical outreach and transforms executive networking from casual connections to strategic growth...", deadline: "Overdue",             status: "In progress", priority: "High",   completedPercent: 60,  pendingPercent: 40 },
  { id: "project-8",  name: "Product Outreach", description: "Physical outreach and transforms executive networking from casual connections to strategic growth...", deadline: "2 days to Deadline",  status: "In progress", priority: "Medium", completedPercent: 35,  pendingPercent: 65 },
];

type ProjectsTab = "projects" | "tasks";

const TABS: { value: ProjectsTab; label: string }[] = [
  { value: "projects", label: "All Projects" },
  { value: "tasks", label: "All Tasks" },
];

// ─── Page content ─────────────────────────────────────────────────────────────
function ProjectsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const activeTab = (searchParams.get("tab") as ProjectsTab) || "projects";

  const handleTabChange = (tab: ProjectsTab) => {
    const params = new URLSearchParams(searchParams.toString());
    tab === "projects" ? params.delete("tab") : params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleViewProject = (id: string) => {
    router.push(`/projects/${id}`);
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
        {activeTab === "projects" ? (
          <ProjectsView
            projects={MOCK_PROJECTS}
            onViewProject={handleViewProject}
          />
        ) : (
          <AllTasksView />
        )}
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F4F7F9] p-8 flex items-center justify-center font-bold text-gray-400">
          Loading Projects...
        </div>
      }
    >
      <ProjectsContent />
    </Suspense>
  );
}
