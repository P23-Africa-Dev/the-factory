"use client";

import { use } from "react";
import { ProjectDetailsView } from "@/components/operations/project-details-view";

export default function ProjectTasksPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const resolvedParams = use(params);
  return <ProjectDetailsView projectId={resolvedParams.projectId} />;
}
