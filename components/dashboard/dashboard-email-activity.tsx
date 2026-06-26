"use client";

import { Mail, Send, AlertTriangle, Clock3 } from "lucide-react";
import { useCrmEmailActivity } from "@/hooks/use-crm-emails";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useAuthStore } from "@/store/auth";

export function DashboardEmailActivity() {
    const user = useAuthStore((s) => s.user);
    const companyId = getActiveCompanyContext(user)?.apiCompanyId ?? undefined;
    const { data, isLoading } = useCrmEmailActivity(companyId, "/admin");

    const stats = data?.stats;
    const items = data?.items ?? [];

    return (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 mt-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-[15px] font-bold text-[#0B1215]">CRM Email Activity</h3>
                <Mail size={16} className="text-[#094B5C]" />
            </div>

            {isLoading ? (
                <p className="text-[12px] text-gray-400">Loading email activity...</p>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="rounded-2xl bg-[#F4FAFA] px-3 py-2.5">
                            <div className="flex items-center gap-1.5 text-[#094B5C] mb-1">
                                <Send size={12} />
                                <span className="text-[10px] font-semibold uppercase tracking-wide">Sent today</span>
                            </div>
                            <p className="text-[20px] font-bold text-[#0B1215]">{stats?.emails_sent_today ?? 0}</p>
                        </div>
                        <div className="rounded-2xl bg-[#F4FAFA] px-3 py-2.5">
                            <div className="flex items-center gap-1.5 text-[#094B5C] mb-1">
                                <Mail size={12} />
                                <span className="text-[10px] font-semibold uppercase tracking-wide">Unread</span>
                            </div>
                            <p className="text-[20px] font-bold text-[#0B1215]">{stats?.unread_crm_emails ?? 0}</p>
                        </div>
                        <div className="rounded-2xl bg-[#FFF7ED] px-3 py-2.5">
                            <div className="flex items-center gap-1.5 text-[#C2410C] mb-1">
                                <Clock3 size={12} />
                                <span className="text-[10px] font-semibold uppercase tracking-wide">Follow-ups</span>
                            </div>
                            <p className="text-[20px] font-bold text-[#0B1215]">{stats?.pending_follow_ups ?? 0}</p>
                        </div>
                        <div className="rounded-2xl bg-[#FEF2F2] px-3 py-2.5">
                            <div className="flex items-center gap-1.5 text-[#DC2626] mb-1">
                                <AlertTriangle size={12} />
                                <span className="text-[10px] font-semibold uppercase tracking-wide">Failed</span>
                            </div>
                            <p className="text-[20px] font-bold text-[#0B1215]">{stats?.failed_deliveries ?? 0}</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {items.length === 0 ? (
                            <p className="text-[11px] text-gray-400">No recent CRM email activity.</p>
                        ) : (
                            items.map((item) => (
                                <div key={item.id} className="rounded-xl border border-gray-100 px-3 py-2">
                                    <p className="text-[11px] font-semibold text-[#0B1215] truncate">
                                        {item.lead?.name ?? "Lead"} · {item.action}
                                    </p>
                                    <p className="text-[10px] text-gray-400 truncate">
                                        {(item.metadata?.subject as string | undefined) ?? item.lead?.email ?? "Email activity"}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
