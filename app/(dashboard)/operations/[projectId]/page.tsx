import { redirect } from "next/navigation";

// The old hard-coded operations board was replaced by the live project board.
export default async function LegacyOperationsProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${encodeURIComponent(projectId)}`);
}
