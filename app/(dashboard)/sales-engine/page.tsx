import { SalesEngineView } from "@/components/sales-engine/sales-engine-view";
import { SalesEngineAccessShell } from "@/components/sales-engine/sales-engine-access-gate";

export default function SalesEnginePage() {
  return (
    <SalesEngineAccessShell>
      <SalesEngineView />
    </SalesEngineAccessShell>
  );
}
