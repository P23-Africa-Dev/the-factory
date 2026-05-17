"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ProjectsView } from "@/components/operations/projects-view";
import { AllTasksView } from "@/components/operations/all-tasks-view";
import { useProjects } from "@/hooks/use-projects";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { buildProjectSlug } from "@/lib/utils/route-slugs";

type ProjectsTab = "projects" | "tasks";

const TABS: { value: ProjectsTab; label: string }[] = [
  { value: "projects", label: "All Projects" },
  { value: "tasks", label: "All Tasks" },
];

function ProjectsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const activeTab = (searchParams.get("tab") as ProjectsTab) || "projects";

  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
  const canManageProjects = role === "owner" || role === "admin" || role === "supervisor";

  const [page, setPage] = useState(1);

  const { data, isPending: isLoading } = useProjects(
    companyId ? { company_id: companyId, page } : {}
  );

  const projects = data?.projects ?? [];
  const pagination = data?.pagination ?? null;

  const handleTabChange = (tab: ProjectsTab) => {
    const params = new URLSearchParams(searchParams.toString());
    tab === "projects" ? params.delete("tab") : params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleViewProject = (id: string, name?: string) => {
    const slug = buildProjectSlug(id, name);
    router.push(`/projects/${slug}`);
  };

  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="max-w-400 mx-auto flex flex-col gap-5">
        <div className="flex items-center gap-4 relative z-20 w-fit">
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

        {activeTab === "projects" ? (
          !canManageProjects ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-500">
              Project management is available to owner, admin, and supervisor roles only.
            </div>
          ) : (
            <ProjectsView
              projects={projects}
              onViewProject={handleViewProject}
              isLoading={isLoading}
              pagination={pagination}
              currentPage={page}
              onPageChange={setPage}
            />
          )
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