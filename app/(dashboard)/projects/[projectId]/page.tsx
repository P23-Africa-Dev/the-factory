"use client";

import { use } from "react";
import { ProjectDetailsView } from "@/components/operations/project-details-view";
import { resolveProjectIdentifier } from "@/lib/utils/route-slugs";

export default function ProjectTasksPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const resolvedParams = use(params);
  const projectId = resolveProjectIdentifier(resolvedParams.projectId);

  return <ProjectDetailsView projectId={projectId} basePath="" />;
}
