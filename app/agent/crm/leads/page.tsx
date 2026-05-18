"use client";

import { CrmLeadsListPage } from "@/components/crm/crm-leads-list-page";

export default function AgentCrmLeadsPage() {
    return (
        <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
            <div className="max-w-350 mx-auto">
                <CrmLeadsListPage apiBasePath="/agent" readOnly />
            </div>
        </div>
    );
}
