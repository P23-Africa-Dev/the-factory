"use client";

import { useId } from "react";
import { AlertCircle, ServerCrash } from "lucide-react";

import type { CrmLabel, FailedImportRow } from "@/lib/api/crm";
import { FALLBACK_SUPPORTED_CURRENCIES } from "@/lib/constants/currencies";
import { IndustryCombobox } from "@/components/crm/industry-combobox";
import {
    IMPORT_PRIORITIES,
    IMPORT_ROW_FIELDS,
    IMPORT_SOURCE_SUGGESTIONS,
    checkImportField,
    importCellText,
    importFieldLabel,
    matchImportStatus,
    type ImportFieldKey,
} from "@/lib/crm/import-row-fixes";

/** Problems per input for one failed row: the server's message, else a live check. */
export function failedRowFieldErrors(row: FailedImportRow, labels: CrmLabel[]): Partial<Record<ImportFieldKey, string>> {
    const errors: Partial<Record<ImportFieldKey, string>> = {};
    for (const field of IMPORT_ROW_FIELDS) {
        const message = row.field_errors?.[field.key] ?? checkImportField(field.key, importCellText(row.data[field.key]), labels);
        if (message) errors[field.key] = message;
    }
    return errors;
}

const inputBase = "w-full rounded-lg border px-3 py-2 text-[12px] bg-white outline-none transition-colors";
const inputOk = "border-gray-200 focus:border-gray-400";
const inputBad = "border-red-400 bg-red-50/40 focus:border-red-500 ring-1 ring-red-200";

export function ImportFailedRowEditor({
    row,
    labels,
    onChange,
}: {
    row: FailedImportRow;
    labels: CrmLabel[];
    onChange: (field: ImportFieldKey, value: string) => void;
}) {
    const idPrefix = useId();
    const fieldErrors = failedRowFieldErrors(row, labels);
    const badFields = IMPORT_ROW_FIELDS.filter((f) => fieldErrors[f.key]);

    // Errors that don't belong to one of the inputs (custom fields, or older responses).
    const knownKeys = new Set<string>(IMPORT_ROW_FIELDS.map((f) => f.key));
    const serverFieldKeys = Object.keys(row.field_errors ?? {});
    // Responses from before keyed errors existed only have the flat list.
    const otherErrors = row.field_errors != null
        ? serverFieldKeys.filter((key) => !knownKeys.has(key)).map((key) => `${importFieldLabel(key)}: ${row.field_errors![key]}`)
        : row.server_error ? [] : row.errors.filter(() => badFields.length === 0);

    const fixed = !row.server_error && badFields.length === 0 && otherErrors.length === 0;

    return (
        <div className={`rounded-xl border p-3 ${fixed ? "border-emerald-200" : "border-gray-200"}`}>
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-[12px] font-semibold text-gray-600">Row {row.row_index}</p>
                {row.server_error ? (
                    <span className="text-[11px] text-gray-500">— not a problem with your data</span>
                ) : fixed ? (
                    <span className="text-[11px] font-medium text-emerald-600">Looks good — ready to retry</span>
                ) : badFields.length > 0 ? (
                    <span className="text-[11px] text-red-600">
                        Fix {badFields.length === 1 ? "1 field" : `${badFields.length} fields`}: {badFields.map((f) => f.label).join(", ")}
                    </span>
                ) : null}
            </div>

            {row.server_error && (
                <div className="mb-2 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
                    <ServerCrash size={14} className="mt-0.5 shrink-0 text-gray-500" />
                    <span>{row.errors[0] ?? "We could not save this row because of a problem on our side. Retry; if it keeps failing, contact support."}</span>
                </div>
            )}

            <div className="grid grid-cols-1 gap-x-2 gap-y-2.5 md:grid-cols-3">
                {IMPORT_ROW_FIELDS.map((field) => {
                    const id = `${idPrefix}-${field.key}`;
                    const errorId = `${id}-error`;
                    const error = fieldErrors[field.key];
                    const value = importCellText(row.data[field.key]);
                    const common = {
                        id,
                        "aria-invalid": error ? true : undefined,
                        "aria-describedby": error ? errorId : undefined,
                        className: `${inputBase} ${error ? inputBad : inputOk}`,
                    };

                    let control: React.ReactNode;
                    if (field.kind === "status") {
                        const match = matchImportStatus(labels, value);
                        control = (
                            <select {...common} value={match?.slug ?? value} onChange={(e) => onChange(field.key, e.target.value)}>
                                <option value="">Default stage</option>
                                {!match && value && <option value={value}>{value} (not a stage)</option>}
                                {labels.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
                            </select>
                        );
                    } else if (field.kind === "priority") {
                        const normalized = value.toLowerCase();
                        const known = (IMPORT_PRIORITIES as readonly string[]).includes(normalized);
                        control = (
                            <select {...common} value={known ? normalized : value} onChange={(e) => onChange(field.key, e.target.value)}>
                                <option value="">Medium (default)</option>
                                {!known && value && <option value={value}>{value} (not valid)</option>}
                                {IMPORT_PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                            </select>
                        );
                    } else if (field.kind === "currency") {
                        const upper = value.toUpperCase();
                        const known = FALLBACK_SUPPORTED_CURRENCIES.some((c) => c.code === upper);
                        control = (
                            <select {...common} value={upper} onChange={(e) => onChange(field.key, e.target.value)}>
                                <option value="">No currency</option>
                                {!known && value && <option value={upper}>{value}</option>}
                                {FALLBACK_SUPPORTED_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                            </select>
                        );
                    } else if (field.kind === "industry") {
                        control = (
                            <IndustryCombobox
                                value={value}
                                onChange={(next) => onChange(field.key, next)}
                                placeholder="Pick or type…"
                                inputClassName={common.className}
                            />
                        );
                    } else if (field.kind === "source") {
                        const listId = `${id}-options`;
                        control = (
                            <>
                                <input
                                    {...common}
                                    list={listId}
                                    value={value}
                                    placeholder="Pick or type…"
                                    onChange={(e) => onChange(field.key, e.target.value)}
                                />
                                <datalist id={listId}>
                                    {IMPORT_SOURCE_SUGGESTIONS.map((o) => <option key={o} value={o} />)}
                                </datalist>
                            </>
                        );
                    } else {
                        control = (
                            <input
                                {...common}
                                type={field.kind === "email" ? "email" : "text"}
                                inputMode={field.kind === "number" ? "decimal" : undefined}
                                value={value}
                                placeholder={field.hint ?? field.label}
                                onChange={(e) => onChange(field.key, e.target.value)}
                            />
                        );
                    }

                    return (
                        <div key={field.key} data-field={field.key} className="min-w-0">
                            <label htmlFor={id} className={`mb-1 block text-[11px] font-medium ${error ? "text-red-600" : "text-gray-500"}`}>
                                {field.label}
                                {field.key === "name" && <span className="text-red-500"> *</span>}
                            </label>
                            {control}
                            {error && (
                                <p id={errorId} className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-red-600">
                                    <AlertCircle size={11} className="mt-0.5 shrink-0" />
                                    {error}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>

            {otherErrors.length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-[11px] text-red-600">
                    {otherErrors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
            )}
        </div>
    );
}
