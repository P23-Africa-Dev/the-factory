"use client";

import { LeadDetailsScreen } from "@/components/crm/lead-details-screen";

/** Agents get the same lead page as managers (minus reassigning). */
export default function AgentLeadDetailsPage() {
  return <LeadDetailsScreen basePath="/agent" />;
}
