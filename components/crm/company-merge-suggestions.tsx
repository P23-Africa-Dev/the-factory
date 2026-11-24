"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ApiRoleBasePath, LeadCompanyGroup } from "@/lib/api/crm";
import { useLeadCompanyGroups, useMergeLeadsByCompany } from "@/hooks/use-crm";

type GroupState = { kind: "open" } | { kind: "kept" } | { kind: "merging" } | { kind: "merged"; leadId: number };

function formatShortDate(value: string | null): string {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * After an upload: leads that share a company (with each other or with older leads)
 * can be merged into one company lead whose people become its contacts.
 */
export function CompanyMergeSuggestions({
    companyId,
    apiBasePath,
    leadIds,
}: {
    companyId: number | string;
    apiBasePath: ApiRoleBasePath;
    leadIds: number[];
}) {
    const { data: groups = [], isLoading, isError } = useLeadCompanyGroups(companyId, leadIds, apiBasePath);
    const mergeMutation = useMergeLeadsByCompany(apiBasePath);
    const [states, setStates] = useState<Record<string, GroupState>>({});
    const leadBase = apiBasePath === "/agent" ? "/agent/crm/leads" : "/crm/leads";

    if (leadIds.length === 0) return null;
    if (isLoading) {
        return (
            <p className="flex items-center gap-2 text-[12px] text-gray-400">
                <Loader2 size={13} className="animate-spin" /> Checking for leads at the same company…
            </p>
        );
    }
    if (isError || groups.length === 0) return null;

    const stateOf = (group: LeadCompanyGroup): GroupState => states[group.key] ?? { kind: "open" };
    const mergeable = groups.filter((group) => group.can_merge && stateOf(group).kind === "open");

    const merge = async (group: LeadCompanyGroup) => {
        setStates((prev) => ({ ...prev, [group.key]: { kind: "merging" } }));
        try {
            const res = await mergeMutation.mutateAsync({
                company_id: companyId,
                lead_ids: group.leads.map((lead) => lead.id),
            });
            setStates((prev) => ({ ...prev, [group.key]: { kind: "merged", leadId: res.data.lead.id } }));
            return true;
        } catch (err) {
            setStates((prev) => ({ ...prev, [group.key]: { kind: "open" } }));
            toast.error(err instanceof Error ? err.message : `Could not merge ${group.company_name}.`);
            return false;
        }
    };

    const mergeAll = async () => {
        let done = 0;
        for (const group of mergeable) {
            if (await merge(group)) done += 1;
        }
        if (done > 0) toast.success(`Merged ${done} ${done === 1 ? "company" : "companies"}.`);
    };

    return (
        <div className="rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
                <div>
                    <p className="text-[13px] font-semibold text-dash-dark">Same company, several leads</p>
                    <p className="text-[11px] text-gray-500">
                        Merge to keep one lead per company with each person as a contact. The oldest lead is kept.
                    </p>
                </div>
                {mergeable.length > 1 && (
                    <button
                        type="button"
                        onClick={mergeAll}
                        disabled={mergeMutation.isPending}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-dash-dark text-white text-[12px] font-semibold disabled:opacity-40"
                    >
                        Merge all ({mergeable.length})
                    </button>
                )}
            </div>

            <ul className="divide-y divide-gray-100 max-h-[40vh] overflow-auto">
                {groups.map((group) => {
                    const state = stateOf(group);
                    if (state.kind === "kept") {
                        return (
                            <li key={group.key} className="px-4 py-2.5 text-[12px] text-gray-400">
                                {group.company_name} kept as {group.leads.length} separate leads.
                            </li>
                        );
                    }

                    return (
                        <li key={group.key} className="px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-dash-dark">
                                        <Building2 size={13} className="text-gray-400" />
                                        {group.company_name}
                                        <span className="font-normal text-gray-400">· {group.leads.length} leads</span>
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-gray-500 truncate">
                                        {group.leads
                                            .map((lead) =>
                                                `${lead.contact_name} (${lead.is_new ? "new" : `existing, ${formatShortDate(lead.created_at)}`})`,
                                            )
                                            .join(" · ")}
                                    </p>
                                </div>

                                <div className="shrink-0 flex items-center gap-2">
                                    {state.kind === "merged" ? (
                                        <span className="flex items-center gap-1.5 text-[12px] text-emerald-600 font-semibold">
                                            <CheckCircle2 size={13} /> Merged ·{" "}
                                            <Link href={`${leadBase}/${state.leadId}`} className="underline">
                                                View
                                            </Link>
                                        </span>
                                    ) : group.can_merge ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setStates((prev) => ({ ...prev, [group.key]: { kind: "kept" } }))}
                                                disabled={state.kind === "merging"}
                                                className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 disabled:opacity-40"
                                            >
                                                Keep separate
                                            </button>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    if (await merge(group)) toast.success(`Merged into ${group.company_name}.`);
                                                }}
                                                disabled={state.kind === "merging"}
                                                className="px-3 py-1.5 rounded-lg bg-dash-dark text-white text-[12px] font-semibold disabled:opacity-40 inline-flex items-center gap-1.5"
                                            >
                                                {state.kind === "merging" && <Loader2 size={12} className="animate-spin" />}
                                                Merge
                                            </button>
                                        </>
                                    ) : (
                                        <span className="text-[11px] text-gray-400">Ask a manager to merge</span>
                                    )}
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
