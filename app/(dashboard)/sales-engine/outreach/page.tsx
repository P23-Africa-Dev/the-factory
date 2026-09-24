import { SalesEngineOutreachView } from "@/components/sales-engine/sales-engine-outreach-view";
import { SalesEngineAccessShell } from "@/components/sales-engine/sales-engine-access-gate";

export const metadata = {
  title: "Outreach Activities | Sales Engine | The Factory",
  description: "View and manage all sales engine outreach activities, delivery statuses, and follow ups.",
};

export default function SalesEngineOutreachPage() {
  return (
    <SalesEngineAccessShell>
      <SalesEngineOutreachView />
    </SalesEngineAccessShell>
  );
}
