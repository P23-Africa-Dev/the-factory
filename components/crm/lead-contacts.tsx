"use client";

import { Briefcase, ChevronLeft, ChevronRight, Link2, Mail, MapPin, Phone, Plus, Trash2, User } from "lucide-react";
import { useState } from "react";

import { FormRow } from "@/components/payroll/payroll/form-row";
import { InlineInput } from "@/components/payroll/payroll/inline-input";
import PhoneNumberInput from "@/components/ui/phone-number-input";
import { LeadDuplicateSuggestions } from "@/components/crm/lead-duplicate-suggestions";
import { ProfileUrlInputs } from "@/components/crm/profile-url-inputs";
import type { LeadContact, LeadDuplicateField, LeadDuplicateMatch } from "@/lib/api/crm";

export type LeadContactErrors = Partial<Record<"name" | "email" | "phone" | "location" | "position" | "profileUrls", string>>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p data-field-error="" role="alert" className="mt-0.5 text-right text-[11px] text-red-500">{message}</p>;
}

export function LeadContactsSlider({
  contacts,
  activeIndex,
  errors = [],
  suggestions,
  variant = "light",
  onActiveIndexChange,
  onChange,
  onAdd,
  onRemove,
  onIdentityInput,
  onSelectSuggestion,
}: {
  contacts: LeadContact[];
  activeIndex: number;
  errors?: LeadContactErrors[];
  suggestions?: { field: LeadDuplicateField | null; matches: LeadDuplicateMatch[] };
  variant?: "light" | "dark";
  onActiveIndexChange: (index: number) => void;
  onChange: (index: number, contact: LeadContact) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onIdentityInput?: (field: LeadDuplicateField, value: string) => void;
  onSelectSuggestion?: (match: LeadDuplicateMatch) => void;
}) {
  const contact = contacts[activeIndex] ?? contacts[0];
  const contactErrors = errors[activeIndex] ?? {};
  const canGoBack = activeIndex > 0;
  const canGoForward = activeIndex < contacts.length - 1;
  const isDark = variant === "dark";

  if (!contact) return null;

  const setField = (field: keyof Pick<LeadContact, "name" | "email" | "phone" | "location" | "position">, value: string) => {
    onChange(activeIndex, { ...contact, [field]: value });
    if (field === "name" || field === "email" || field === "phone") {
      onIdentityInput?.(field, value);
    }
  };

  const suggestionList = onSelectSuggestion && suggestions ? (
    <LeadDuplicateSuggestions matches={suggestions.matches} onSelect={onSelectSuggestion} />
  ) : null;

  const darkInputClass =
    "bg-[#1A2E33] border border-[#2D454B] rounded-xl px-4 py-2 text-white text-[14px] font-semibold w-full outline-none focus:border-[#6FA8A6] placeholder:text-white/30";
  const darkLabelClass = "block text-gray-400 text-[11px] font-medium mb-1";
  const profileUrls = contact.profile_urls?.length ? contact.profile_urls : [""];

  return (
    <section className={isDark ? "space-y-4" : "mb-5 space-y-4"} aria-label="Lead contact details">
      <div className="flex items-center gap-3">
        <div className={`h-px flex-1 ${isDark ? "bg-[#2D454B]" : "bg-gray-200"}`} />
        <span className={`text-center text-[12px] font-medium ${isDark ? "text-white/70" : "text-gray-500"}`}>
          Lead Contact Details
        </span>
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add another contact"
          className={`flex h-7 w-7 items-center justify-center rounded-full border shadow-sm transition cursor-pointer ${
            isDark
              ? "border-[#2D454B] bg-[#1A2E33] text-white hover:border-[#6FA8A6] hover:bg-[#1E383F]"
              : "border-gray-200 bg-white text-[#0B1215] hover:border-[#6FA8A6] hover:bg-[#F1F8F7]"
          }`}
        >
          <Plus size={14} />
        </button>
      </div>

      <div
        className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
          isDark ? "border-[#2D454B] bg-[#14292E]" : "border-gray-100 bg-gray-50"
        }`}
      >
        <button
          type="button"
          aria-label="Previous contact"
          disabled={!canGoBack}
          onClick={() => onActiveIndexChange(activeIndex - 1)}
          className={`rounded-lg p-1.5 transition disabled:cursor-not-allowed disabled:opacity-25 ${
            isDark
              ? "text-white/60 hover:bg-[#1A2E33] hover:text-white"
              : "text-gray-500 hover:bg-white hover:text-[#0B1215]"
          }`}
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <p className={`text-[12px] font-semibold ${isDark ? "text-white" : "text-[#0B1215]"}`}>
            Contact {activeIndex + 1} of {contacts.length}
          </p>
          <p className={`text-[10px] ${isDark ? "text-white/50" : "text-gray-400"}`}>
            {activeIndex === 0 ? "Primary contact" : "Additional contact"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {contacts.length > 1 && (
            <button
              type="button"
              aria-label={`Remove contact ${activeIndex + 1}`}
              onClick={() => onRemove(activeIndex)}
              className={`rounded-lg p-1.5 transition ${
                isDark
                  ? "text-white/50 hover:bg-red-500/15 hover:text-red-300"
                  : "text-gray-400 hover:bg-red-50 hover:text-red-500"
              }`}
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            type="button"
            aria-label="Next contact"
            disabled={!canGoForward}
            onClick={() => onActiveIndexChange(activeIndex + 1)}
            className={`rounded-lg p-1.5 transition disabled:cursor-not-allowed disabled:opacity-25 ${
              isDark
                ? "text-white/60 hover:bg-[#1A2E33] hover:text-white"
                : "text-gray-500 hover:bg-white hover:text-[#0B1215]"
            }`}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {isDark ? (
        <div key={activeIndex} className="animate-in fade-in slide-in-from-right-2 grid grid-cols-1 min-[480px]:grid-cols-2 gap-x-6 sm:gap-x-8 gap-y-4 duration-200">
          <div>
            <label className={darkLabelClass}>Name *</label>
            <input
              type="text"
              value={contact.name}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="E.g John Doe"
              className={darkInputClass}
            />
            <FieldError message={contactErrors.name} />
            {suggestions?.field === "name" ? suggestionList : null}
          </div>

          <div>
            <label className={darkLabelClass}>Email</label>
            <input
              type="email"
              value={contact.email ?? ""}
              onChange={(event) => setField("email", event.target.value)}
              placeholder="E.g john.doe@example.com"
              className={darkInputClass}
            />
            <FieldError message={contactErrors.email} />
            {suggestions?.field === "email" ? suggestionList : null}
          </div>

          <div>
            <label className={darkLabelClass}>Phone</label>
            <PhoneNumberInput
              value={contact.phone ?? ""}
              onChange={(value) => setField("phone", value)}
              placeholder="E.g 555-0199"
              defaultCountry="GB"
              variant="dark"
            />
            <FieldError message={contactErrors.phone} />
            {suggestions?.field === "phone" ? suggestionList : null}
          </div>

          <div>
            <label className={darkLabelClass}>Location</label>
            <input
              type="text"
              value={contact.location ?? ""}
              onChange={(event) => setField("location", event.target.value)}
              placeholder="E.g New York, USA"
              className={darkInputClass}
            />
            <FieldError message={contactErrors.location} />
          </div>

          <div>
            <label className={darkLabelClass}>Position</label>
            <input
              type="text"
              value={contact.position ?? ""}
              onChange={(event) => setField("position", event.target.value)}
              placeholder="E.g Head of Sales"
              className={darkInputClass}
            />
            <FieldError message={contactErrors.position} />
          </div>

          <div className="min-[480px]:col-span-2 space-y-2">
            <label className={darkLabelClass}>Profile URL</label>
            {profileUrls.map((url, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => {
                    const next = [...profileUrls];
                    next[idx] = e.target.value;
                    onChange(activeIndex, { ...contact, profile_urls: next });
                  }}
                  placeholder="https://linkedin.com/in/username"
                  className={darkInputClass}
                />
                {profileUrls.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = profileUrls.filter((_, i) => i !== idx);
                      onChange(activeIndex, { ...contact, profile_urls: next.length ? next : [""] });
                    }}
                    className="shrink-0 rounded-lg border border-[#2D454B] bg-[#1A2E33] px-2.5 py-2 text-[12px] text-white/70 hover:text-white cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {profileUrls.some((u) => u.trim() !== "") && (
              <button
                type="button"
                onClick={() => onChange(activeIndex, { ...contact, profile_urls: [...profileUrls, ""] })}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6FA8A6] hover:underline cursor-pointer"
              >
                <Plus size={12} /> Add another URL
              </button>
            )}
            <FieldError message={contactErrors.profileUrls} />
          </div>
        </div>
      ) : (
      <div key={activeIndex} className="animate-in fade-in slide-in-from-right-2 space-y-4 duration-200">
        <div>
          <FormRow label="Name *" labelClassName="w-28">
            <InlineInput
              value={contact.name}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="E.g John Doe"
              className="col-span-2"
            />
          </FormRow>
          <FieldError message={contactErrors.name} />
          {suggestions?.field === "name" ? suggestionList : null}
        </div>

        <div>
          <FormRow label="Email" labelClassName="w-28">
            <InlineInput
              type="email"
              value={contact.email ?? ""}
              onChange={(event) => setField("email", event.target.value)}
              placeholder="E.g john.doe@example.com"
              className="col-span-2"
            />
          </FormRow>
          <FieldError message={contactErrors.email} />
          {suggestions?.field === "email" ? suggestionList : null}
        </div>

        <div>
          <FormRow label="Phone" labelClassName="w-28">
            <div className="col-span-2 w-full">
              <PhoneNumberInput
                value={contact.phone ?? ""}
                onChange={(value) => setField("phone", value)}
                placeholder="E.g 555-0199"
                defaultCountry="GB"
                variant="compact"
              />
            </div>
          </FormRow>
          <FieldError message={contactErrors.phone} />
          {suggestions?.field === "phone" ? suggestionList : null}
        </div>

        <div>
          <FormRow label="Location" labelClassName="w-28">
            <InlineInput
              value={contact.location ?? ""}
              onChange={(event) => setField("location", event.target.value)}
              placeholder="E.g New York, USA"
              className="col-span-2"
            />
          </FormRow>
          <FieldError message={contactErrors.location} />
        </div>

        <div>
          <FormRow label="Position" labelClassName="w-28">
            <InlineInput
              value={contact.position ?? ""}
              onChange={(event) => setField("position", event.target.value)}
              placeholder="E.g Head of Sales"
              className="col-span-2"
            />
          </FormRow>
          <FieldError message={contactErrors.position} />
        </div>

        <ProfileUrlInputs
          values={contact.profile_urls?.length ? contact.profile_urls : [""]}
          onChange={(values) => onChange(activeIndex, { ...contact, profile_urls: values })}
          errors={contactErrors.profileUrls ? [contactErrors.profileUrls] : []}
        />
      </div>
      )}
    </section>
  );
}

export function LeadContactsView({ contacts }: { contacts: LeadContact[] }) {
  if (contacts.length === 0) return null;

  return (
    <section aria-label="Lead contacts" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-[#0B1215]">Contacts</h2>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-medium text-gray-500">
          {contacts.length} total
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {contacts.map((contact, index) => (
          <article key={contact.id ?? `${contact.name}-${index}`} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#094B5C] shadow-sm">
                  <User size={14} />
                </div>
                <p className="truncate text-[13px] font-semibold text-[#0B1215]">{contact.name}</p>
              </div>
              {index === 0 && (
                <span className="rounded-full bg-[#E5F2F0] px-2 py-1 text-[9px] font-semibold text-[#094B5C]">
                  Primary
                </span>
              )}
            </div>
            <div className="space-y-2 text-[11px] text-gray-500">
              {contact.position && <p className="flex items-center gap-2"><Briefcase size={12} />{contact.position}</p>}
              {contact.email && <p className="flex items-center gap-2"><Mail size={12} />{contact.email}</p>}
              {contact.phone && <p className="flex items-center gap-2"><Phone size={12} />{contact.phone}</p>}
              {contact.location && <p className="flex items-center gap-2"><MapPin size={12} />{contact.location}</p>}
              {contact.profile_urls && contact.profile_urls.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {contact.profile_urls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-[#094B5C] hover:underline"
                    >
                      <Link2 size={10} />
                      {url.replace(/^https?:\/\//i, "")}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function LeadContactHeroSlider({ contacts }: { contacts: LeadContact[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const safeIndex = Math.min(activeIndex, Math.max(contacts.length - 1, 0));
  const contact = contacts[safeIndex];

  if (!contact) return null;

  const canGoBack = safeIndex > 0;
  const canGoForward = safeIndex < contacts.length - 1;

  return (
    <section
      aria-label="Lead contact details"
      className="space-y-5 border-b border-white/10 pb-6"
    >
      <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7DD3FC]">
            Contact Details
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            Contact {safeIndex + 1} of {contacts.length}
            {safeIndex === 0 ? " · Primary" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous contact"
            disabled={!canGoBack}
            onClick={() => setActiveIndex(safeIndex - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-25"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label="Next contact"
            disabled={!canGoForward}
            onClick={() => setActiveIndex(safeIndex + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-25"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div
        key={safeIndex}
        className="grid animate-in grid-cols-1 gap-x-6 gap-y-4 fade-in slide-in-from-right-2 duration-200 min-[480px]:grid-cols-2 sm:gap-x-8"
      >
        <div className="flex min-w-0 flex-col">
          <span className="mb-1 text-[11px] font-medium text-gray-400">Name</span>
          <p className="truncate text-[16px] font-semibold text-white">{contact.name || "N/A"}</p>
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="mb-1 text-[11px] font-medium text-gray-400">Phone Number</span>
          {contact.phone ? (
            <a href={`tel:${contact.phone}`} className="truncate text-[16px] font-semibold text-white hover:underline">
              {contact.phone}
            </a>
          ) : (
            <p className="text-[16px] font-semibold text-white">N/A</p>
          )}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="mb-1 text-[11px] font-medium text-gray-400">Email Address</span>
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className="truncate text-[16px] font-semibold text-[#7DD3FC] hover:underline">
              {contact.email}
            </a>
          ) : (
            <p className="text-[16px] font-semibold text-white">N/A</p>
          )}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="mb-1 text-[11px] font-medium text-gray-400">Location</span>
          <p className="truncate text-[16px] font-semibold text-white">{contact.location || "N/A"}</p>
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="mb-1 text-[11px] font-medium text-gray-400">Position</span>
          <p className="truncate text-[16px] font-semibold text-white">{contact.position || "N/A"}</p>
        </div>
        {contact.profile_urls && contact.profile_urls.length > 0 && (
          <div className="flex min-w-0 flex-col min-[480px]:col-span-2">
            <span className="mb-1 text-[11px] font-medium text-gray-400">Profile URLs</span>
            <div className="flex flex-wrap gap-2">
              {contact.profile_urls.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-[14px] font-semibold text-[#7DD3FC] hover:underline"
                >
                  {url}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
