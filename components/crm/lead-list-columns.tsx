"use client";

import { useEffect, useState } from "react";
import type { LeadCustomFieldValue, LeadFieldDefinition } from "@/lib/api/crm";
import { formatCustomFieldValue, readHiddenLeadColumns, writeHiddenLeadColumns } from "@/lib/crm/custom-fields";

export const LEAD_LIST_COLUMNS = [
    { id: "name", label: "Leads", color: "#3B82F6", size: "minmax(140px,1fr)", hideable: false },
    { id: "company", label: "Company", color: "#D946EF", size: "minmax(150px,1.4fr)", hideable: true },
    { id: "status", label: "Status", color: "#F59E0B", size: "minmax(120px,1.1fr)", hideable: true },
    { id: "value", label: "Value", color: "#06B6D4", size: "minmax(100px,0.9fr)", hideable: true },
    { id: "assigned", label: "Assigned to", color: "#8B5CF6", size: "minmax(120px,1fr)", hideable: true },
    { id: "source", label: "Source", color: "#65A30D", size: "minmax(100px,0.9fr)", hideable: true },
] as const;

export type LeadListColumnId = (typeof LEAD_LIST_COLUMNS)[number]["id"];

export function useHiddenLeadColumns(companyId?: number | string) {
    const [hidden, setHidden] = useState<string[]>([]);

    useEffect(() => {
        if (companyId == null) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate company-scoped browser preferences after SSR and when the company changes.
        setHidden(readHiddenLeadColumns(companyId));
    }, [companyId]);

    const update = (next: string[]) => {
        setHidden(next);
        if (companyId != null) writeHiddenLeadColumns(companyId, next);
    };

    const hide = (id: string) => {
        if (hidden.includes(id)) return;
        update([...hidden, id]);
    };

    const show = (id: string) => update(hidden.filter((item) => item !== id));

    const visible = (id: string) => id === "name" || !hidden.includes(id);

    return { hidden, hide, show, visible };
}

export function leadListGridTemplate(visible: (id: string) => boolean, customCount: number): string {
    const sizes = ["40px"];
    LEAD_LIST_COLUMNS.forEach((column) => {
        if (visible(column.id)) sizes.push(column.size);
    });
    for (let index = 0; index < customCount; index += 1) sizes.push("minmax(140px,1fr)");
    sizes.push("72px", "100px");
    return sizes.join(" ");
}

export function LeadCustomColumnHeaders({
    fields,
    onHide,
}: {
    fields: LeadFieldDefinition[];
    onHide: (key: string) => void;
}) {
    return fields.map((field) => (
        <div key={field.key} className="flex items-center justify-center gap-1 rounded-full bg-[#0F766E] px-3 py-2 text-center text-[12px] font-semibold text-white">
            <span className="truncate">{field.label}</span>
            {field.status === "pending" ? (
                <span className="rounded-full bg-white/20 px-1.5 text-[9px] uppercase">Pending</span>
            ) : null}
            <button
                type="button"
                aria-label={`Hide ${field.label}`}
                className="text-white/80"
                onClick={() => onHide(`custom:${field.key}`)}
            >
                ×
            </button>
        </div>
    ));
}

export function LeadCustomColumnCells({
    fields,
    values,
    selected,
}: {
    fields: LeadFieldDefinition[];
    values: Record<string, LeadCustomFieldValue | undefined>;
    selected: boolean;
}) {
    return fields.map((field) => (
        <span
            key={field.key}
            className={`truncate text-center text-[12px] ${selected ? "text-white/80" : "text-gray-500"}`}
        >
            {formatCustomFieldValue(field, values[field.key])}
        </span>
    ));
}

export function LeadColumnMenu({
    hidden,
    customFields,
    onHide,
    onShow,
    onAdd,
}: {
    hidden: string[];
    customFields: LeadFieldDefinition[];
    onHide: (id: string) => void;
    onShow: (id: string) => void;
    onAdd: () => void;
}) {
    const [open, setOpen] = useState(false);

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                className="rounded-md px-2 py-1.5 text-[12px] font-semibold text-gray-500 hover:text-gray-700"
            >
                Columns
            </button>
            {open ? (
                <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-gray-100 bg-white p-2 shadow-xl">
                    {LEAD_LIST_COLUMNS.filter((column) => column.hideable).map((column) => {
                        const isHidden = hidden.includes(column.id);
                        return (
                            <label key={column.id} className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={!isHidden}
                                    onChange={() => (isHidden ? onShow(column.id) : onHide(column.id))}
                                />
                                {column.label}
                            </label>
                        );
                    })}
                    {customFields.map((field) => {
                        const id = `custom:${field.key}`;
                        const isHidden = hidden.includes(id);
                        return (
                            <label key={field.key} className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={!isHidden}
                                    onChange={() => (isHidden ? onShow(id) : onHide(id))}
                                />
                                {field.label}
                            </label>
                        );
                    })}
                    <button type="button" onClick={() => { setOpen(false); onAdd(); }} className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-[12px] font-semibold text-[#2563EB]">
                        Add column
                    </button>
                </div>
            ) : null}
        </div>
    );
}
