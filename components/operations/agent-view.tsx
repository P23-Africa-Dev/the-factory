'use client';

import { AgentCurveChart } from './agent-curve-chart';
import { AgentList } from './agent-list';
import { AgentSidebar } from './agent-sidebar';

export function AgentView() {
  return (
    <div className="flex flex-col xl:flex-row gap-5 mt-2 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Left column: chart + agent list */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">
        <AgentCurveChart />
        <AgentList />
      </div>

      {/* Right column: agent info + live details */}
      <AgentSidebar />
    </div>
  );
}
