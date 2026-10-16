"use client";

import type { LeadDuplicateMatch, LeadMergePreview, LeadMergeSnapshot } from "@/lib/api/crm";

const SNAPSHOT_FIELDS: Array<{ key: keyof LeadMergeSnapshot; label: string }> = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "location", label: "Location" },
  { key: "company_name", label: "Company" },
  { key: "company_email", label: "Company email" },
  { key: "website", label: "Website" },
  { key: "position", label: "Position" },
  { key: "source", label: "Source" },
  { key: "next_action", label: "Next action" },
];

function displayValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  return String(value);
}

export function LeadDuplicateSuggestions({
  matches,
  onSelect,
}: {
  matches: LeadDuplicateMatch[];
  onSelect: (match: LeadDuplicateMatch) => void;
}) {
  if (matches.length === 0) return null;

  return (
    <ul
      role="listbox"
      aria-label="Existing leads"
      className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-[#D7E6E4] bg-white shadow-sm"
    >
      {matches.map((match) => (
        <li key={`${match.id}-${match.matched_on}`}>
          <button
            type="button"
            role="option"
            aria-selected={match.match_type === "exact"}
            onClick={() => onSelect(match)}
            className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-[#F1F8F7]"
          >
            <span className="text-[12px] font-semibold text-[#0B1215]">
              {match.name}
              {match.match_type === "exact" ? " · Exact match" : ""}
            </span>
            <span className="text-[11px] text-gray-500">
              {[match.email, match.phone, match.company_name].filter(Boolean).join(" · ") || "Existing lead"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function LeadDuplicateNotice({
  match,
  onMerge,
  onSaveAsNew,
}: {
  match: LeadDuplicateMatch;
  onMerge: () => void;
  onSaveAsNew: () => void;
}) {
  return (
    <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
      <p className="text-[12px] font-semibold text-[#0B1215]">
        This matches an existing lead: {match.name}
      </p>
      <p className="mt-1 text-[11px] text-gray-600">
        {[match.email, match.phone, match.company_name].filter(Boolean).join(" · ") || "Already in your CRM"}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {match.can_merge && (
          <button
            type="button"
            onClick={onMerge}
            className="rounded-lg bg-[#0B1215] px-3 py-1.5 text-[12px] font-semibold text-white"
          >
            Merge
          </button>
        )}
        <button
          type="submit"
          onClick={onSaveAsNew}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0B1215]"
        >
          Save as new lead
        </button>
      </div>
      {!match.can_merge && (
        <p className="mt-2 text-[11px] text-gray-600">
          You can still save this as a new lead. Merging is available when you can edit the existing lead.
        </p>
      )}
    </div>
  );
}

function SnapshotColumn({ title, snapshot }: { title: string; snapshot: LeadMergeSnapshot }) {
  const budget = snapshot.budget_amount != null
    ? `${snapshot.budget_currency ?? "USD"} ${snapshot.budget_amount}`
    : "—";

  return (
    <section className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white p-3">
      <h3 className="mb-2 text-[12px] font-semibold text-[#0B1215]">{title}</h3>
      <dl className="space-y-1.5">
        {SNAPSHOT_FIELDS.map((field) => (
          <div key={field.key} className="grid grid-cols-[88px_1fr] gap-2 text-[11px]">
            <dt className="text-gray-500">{field.label}</dt>
            <dd className="truncate text-[#0B1215]">{displayValue(snapshot[field.key])}</dd>
          </div>
        ))}
        <div className="grid grid-cols-[88px_1fr] gap-2 text-[11px]">
          <dt className="text-gray-500">Budget</dt>
          <dd className="text-[#0B1215]">{budget}</dd>
        </div>
        <div className="pt-1 text-[11px]">
          <p className="text-gray-500">Contacts</p>
          {(snapshot.contacts ?? []).length === 0 ? (
            <p className="text-[#0B1215]">—</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {(snapshot.contacts ?? []).map((contact, index) => (
                <li key={`${contact.name}-${index}`} className="text-[#0B1215]">
                  {contact.name}
                  {contact.email ? ` · ${contact.email}` : ""}
                  {contact.phone ? ` · ${contact.phone}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </dl>
    </section>
  );
}

export function LeadMergeDialog({
  preview,
  isLoading,
  isSaving,
  onClose,
  onConfirm,
}: {
  preview: LeadMergePreview | null;
  isLoading: boolean;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" aria-label="Close merge preview" className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-[16px] font-bold text-[#0B1215]">Merge into existing lead</h2>
          <p className="mt-1 text-[12px] text-gray-500">
            Filled values on the existing lead stay as they are. Empty fields are filled from what you are adding.
          </p>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4">
          {isLoading || !preview ? (
            <p className="text-[13px] text-gray-500">Preparing merge preview…</p>
          ) : (
            <div className="flex flex-col gap-3 lg:flex-row">
              <SnapshotColumn title="What you already have" snapshot={preview.existing} />
              <SnapshotColumn title="What you are adding" snapshot={preview.incoming} />
              <SnapshotColumn title="After merge" snapshot={preview.result} />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-[13px] font-semibold">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!preview || isSaving}
            className="rounded-lg bg-[#0B1215] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {isSaving ? "Merging…" : "Confirm merge"}
          </button>
        </div>
      </div>
    </div>
  );
}
