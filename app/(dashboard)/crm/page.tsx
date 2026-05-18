"use client";

import { CrmKanbanPage } from "@/components/crm/crm-kanban-page";

export default function CrmPage() {
    return (
        <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
            <div className="max-w-350 mx-auto">
                <CrmKanbanPage apiBasePath="/admin" readOnly={false} />
            </div>
        </div>
    );
}
