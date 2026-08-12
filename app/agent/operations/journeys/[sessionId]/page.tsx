"use client";

import dynamic from "next/dynamic";
import { use } from "react";

const JourneyView = dynamic(
  () =>
    import("@/components/operations/journey-view").then((m) => m.JourneyView),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[calc(100vh-64px)] bg-[#F4F6F7] animate-pulse" />
    ),
  },
);

export default function AgentJourneyPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);

  return (
    <JourneyView
      sessionId={sessionId}
      asAgent
      backHref="/agent/operations/journey_history"
      journeyBasePath="/agent/operations/journeys"
    />
  );
}
