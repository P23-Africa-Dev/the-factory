import { Suspense } from "react";
import { SalesEnginePendingReviewView } from "@/components/sales-engine/sales-engine-pending-review-view";
import { SalesEngineAccessShell } from "@/components/sales-engine/sales-engine-access-gate";

export const metadata = {
  title: "Pending Review Leads | Sales Engine | The Factory",
  description: "Review and qualify prospective leads discovered by Sales Engine before adding them to your CRM pipeline.",
};

export default function SalesEnginePendingReviewPage() {
  return (
    <SalesEngineAccessShell>
      <Suspense fallback={<div className="min-h-screen bg-[#f8f8f8]" />}>
        <SalesEnginePendingReviewView />
      </Suspense>
    </SalesEngineAccessShell>
  );
}
