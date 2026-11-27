'use client';

import React, { useState, useEffect, use } from 'react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import {
  useLead,
  useCrmLabels,
  useCrmPipelines,
  useLeadFields,
  useUpdateLead,
  useCrmNavigation,
  type CrmLabel,
  type Lead,
  LeadContactsStack,
  type LeadContact,
  type LeadCustomFields,
} from '@/features/crm';
import { useSavedLocations } from '@/features/locations/queries';
import {
  formValuesFromLead,
  serializeCustomFields,
  validateCustomFieldValues,
  visibleLeadFieldsForDetail,
} from '@/features/crm/customFields';
import { PwaAddLeadFieldSheet, PwaCustomFields } from '@/features/crm/components/PwaCustomFields';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { toast } from '@/lib/toast';
import { showApiErrorToast } from '@/lib/api/errors';
import { formatPhoneNumber } from '@/lib/phone';


interface LeadDetailPageProps {
  params: Promise<{ id: string }>;
}

const COUNTRY_CODES = [
  { code: "+44", label: "GB (+44)" },
  { code: "+234", label: "NG (+234)" },
  { code: "+254", label: "KE (+254)" },
  { code: "+233", label: "GH (+233)" },
  { code: "+27", label: "ZA (+27)" },
  { code: "+1", label: "US (+1)" },
] as const;

function parsePhoneNumber(fullPhone: string | null | undefined): { countryCode: string; phonePart: string } {
  if (!fullPhone) {
    return { countryCode: "+44", phonePart: "" };
  }
  const sortedCodes = [...COUNTRY_CODES].map(c => c.code).sort((a, b) => b.length - a.length);
  for (const code of sortedCodes) {
    if (fullPhone.startsWith(code)) {
      return {
        countryCode: code,
        phonePart: fullPhone.slice(code.length).trim(),
      };
    }
  }
  return { countryCode: "+44", phonePart: fullPhone };
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col border-b border-white/5 py-3 last:border-none">
      <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1">
        {label}
      </span>
      <span className="text-sm font-medium text-white leading-relaxed">
        {value}
      </span>
    </div>
  );
}

function StatusPicker({
  currentStatus,
  labels,
  onSelect,
}: {
  currentStatus: string | null;
  labels: CrmLabel[];
  onSelect: (slug: string) => void;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3">
        Select Status
      </span>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none select-none">
        {labels.map((label) => {
          const isActive = currentStatus === label.slug;
          return (
            <button
              key={label.slug}
              onClick={() => onSelect(label.slug)}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap active:scale-95"
              style={{
                backgroundColor: isActive ? label.color : 'rgba(255,255,255,0.08)',
                borderColor: isActive ? label.color : 'rgba(255,255,255,0.15)',
                color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.6)',
              }}
            >
              {label.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Edit form ──────────────────────────────────────────────────────────── */

const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const;
const BUDGET_CURRENCIES = ['GBP', 'USD', 'EUR', 'NGN', 'KES', 'GHS', 'ZAR', 'JPY', 'CAD', 'AUD'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EditContact = {
  name: string;
  email: string;
  countryCode: string;
  phonePart: string;
  location: string;
  position: string;
  /** One URL per line. */
  profileUrls: string;
};

type EditForm = {
  contacts: EditContact[];
  companyName: string;
  companyEmail: string;
  website: string;
  industry: string;
  status: string;
  pipelineId: string;
  priority: string;
  source: string;
  nextAction: string;
  lastInteraction: string;
  /** `datetime-local` value. */
  lastInteractionAt: string;
  budgetAmount: string;
  budgetCurrency: string;
  /** Linked saved map location id, '' when not linked. */
  companyLocationId: string;
};

const inputClass =
  'w-full bg-white/[0.08] text-white text-sm border border-white/15 focus:border-[#44AFCD]/50 rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder-white/30';
const selectClass =
  'w-full bg-white/[0.08] text-white text-sm border border-white/15 focus:border-[#44AFCD]/50 rounded-xl px-3 py-2.5 focus:outline-none transition-all';
const optionStyle = { backgroundColor: '#0A1D25' };

function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocal(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Accepts "linkedin.com/in/x" as well as full URLs; the API wants http(s). */
function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.');
  } catch {
    return false;
  }
}

function splitUrls(text: string): string[] {
  return text.split(/[\n,]+/).map(normalizeUrl).filter(Boolean);
}

function toEditContact(contact: LeadContact, fallback?: { position?: string | null; profileUrls?: string[] }): EditContact {
  const parsed = parsePhoneNumber(contact.phone);
  const urls = contact.profile_urls?.length ? contact.profile_urls : fallback?.profileUrls ?? [];
  return {
    name: contact.name ?? '',
    email: contact.email ?? '',
    countryCode: parsed.countryCode,
    phonePart: parsed.phonePart,
    location: contact.location ?? '',
    position: contact.position ?? fallback?.position ?? '',
    profileUrls: urls.join('\n'),
  };
}

function buildEditForm(lead: Lead): EditForm {
  const contacts = lead.contacts.length > 0
    ? lead.contacts.map((contact, index) =>
        // Older leads kept position/URLs only on the lead: seed contact 1 from it.
        toEditContact(contact, index === 0 ? { position: lead.position, profileUrls: lead.profileUrls } : undefined))
    : [toEditContact(
        { name: lead.name, email: lead.email, phone: lead.phone, location: lead.location },
        { position: lead.position, profileUrls: lead.profileUrls },
      )];
  return {
    contacts,
    companyName: lead.companyName ?? '',
    companyEmail: lead.companyEmail ?? '',
    website: lead.website ?? '',
    industry: lead.industry ?? '',
    status: lead.status ?? '',
    pipelineId: lead.pipelineId != null ? String(lead.pipelineId) : '',
    priority: lead.priority ?? 'medium',
    source: lead.source ?? '',
    nextAction: lead.nextAction ?? '',
    lastInteraction: lead.lastInteraction ?? '',
    lastInteractionAt: toDateTimeLocal(lead.lastInteractionAt),
    budgetAmount: lead.budgetAmount != null ? String(lead.budgetAmount) : '',
    budgetCurrency: lead.budgetCurrency ?? 'GBP',
    companyLocationId: lead.companyLocationId != null ? String(lead.companyLocationId) : '',
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold text-white/50 uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h5 className="text-[11px] font-bold text-[#44AFCD] uppercase tracking-widest pt-2">{children}</h5>;
}

export default function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { id } = use(params);
  const { goBack } = useCrmNavigation();

  const { data: lead, isLoading, isError } = useLead(id);
  const { data: labels = [] } = useCrmLabels();
  const { data: pipelines = [] } = useCrmPipelines();
  const { data: savedLocations = [] } = useSavedLocations();
  const { data: leadFields = [] } = useLeadFields();
  const { mutate: updateLead, isPending: isUpdating } = useUpdateLead({
    onSuccess: () => {
      toast.success('Lead updated successfully');
    },
  });

  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [editCustomFields, setEditCustomFields] = useState<LeadCustomFields>({});
  const [showFieldDialog, setShowFieldDialog] = useState(false);
  const [sessionFieldIds, setSessionFieldIds] = useState<number[]>([]);
  const visibleFields = visibleLeadFieldsForDetail(leadFields, lead?.customFields, sessionFieldIds);

  // Keep the custom field values in step with the loaded lead while not editing.
  useEffect(() => {
    if (lead && !editMode) {
      setTimeout(() => setEditCustomFields(formValuesFromLead(leadFields, lead.customFields)), 0);
    }
  }, [lead, leadFields, editMode]);

  const startEdit = () => {
    if (!lead) return;
    setForm(buildEditForm(lead));
    setEditCustomFields(formValuesFromLead(leadFields, lead.customFields));
    setEditMode(true);
  };

  const setField = <K extends keyof EditForm>(key: K, value: EditForm[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const setContact = (index: number, patch: Partial<EditContact>) =>
    setForm((current) =>
      current
        ? { ...current, contacts: current.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)) }
        : current,
    );

  const addContact = () =>
    setForm((current) =>
      current
        ? {
            ...current,
            contacts: [
              ...current.contacts,
              { name: '', email: '', countryCode: '+44', phonePart: '', location: '', position: '', profileUrls: '' },
            ],
          }
        : current,
    );

  const removeContact = (index: number) =>
    setForm((current) =>
      current && current.contacts.length > 1
        ? { ...current, contacts: current.contacts.filter((_, i) => i !== index) }
        : current,
    );

  const handleStatusChange = (slug: string) => {
    if (!lead) return;
    const companyId = getActiveCompanyId();
    if (!companyId) {
      toast.error('No active company selected');
      return;
    }
    updateLead(
      {
        id: lead.id,
        payload: { company_id: companyId, status: slug },
      },
      {
        onError: (err) => showApiErrorToast(err, 'Could not update lead status'),
      },
    );
  };

  const handleSaveEdit = () => {
    if (!lead || !form) return;
    const companyId = getActiveCompanyId();
    if (!companyId) {
      toast.error('No active company selected');
      return;
    }

    for (const [index, contact] of form.contacts.entries()) {
      if (!contact.name.trim()) {
        toast.error(`Contact ${index + 1} needs a name.`);
        return;
      }
      if (contact.email.trim() && !EMAIL_RE.test(contact.email.trim())) {
        toast.error(`Contact ${index + 1} has an invalid email.`);
        return;
      }
      if (splitUrls(contact.profileUrls).some((url) => !isValidUrl(url))) {
        toast.error(`Contact ${index + 1} has an invalid profile URL.`);
        return;
      }
    }
    if (form.companyEmail.trim() && !EMAIL_RE.test(form.companyEmail.trim())) {
      toast.error('Enter a valid company email.');
      return;
    }
    const website = normalizeUrl(form.website);
    if (website && !isValidUrl(website)) {
      toast.error('Enter a valid website.');
      return;
    }
    const budgetText = form.budgetAmount.replace(/,/g, '').trim();
    const budgetAmount = budgetText ? Number(budgetText) : null;
    if (budgetAmount !== null && (Number.isNaN(budgetAmount) || budgetAmount < 0)) {
      toast.error('Enter a valid budget amount.');
      return;
    }
    const customErrors = validateCustomFieldValues(leadFields, editCustomFields);
    const firstCustomError = Object.values(customErrors)[0];
    if (firstCustomError) {
      toast.error(firstCustomError);
      return;
    }

    // Every contact keeps its own position and URLs: the API replaces all
    // contact rows on save, so anything left out would be wiped.
    const contacts = form.contacts.map((contact, index) => {
      const urls = splitUrls(contact.profileUrls);
      return {
        name: contact.name.trim(),
        email: contact.email.trim() || null,
        phone: formatPhoneNumber(contact.countryCode, contact.phonePart),
        location: contact.location.trim() || null,
        position: contact.position.trim() || null,
        profile_urls: urls.length > 0 ? urls : null,
        sort_order: index,
      };
    });
    const primary = contacts[0];
    const companyName = form.companyName.trim();

    updateLead(
      {
        id: lead.id,
        payload: {
          company_id: companyId,
          // A company lead is named after the company, as on the web.
          name: companyName || primary.name,
          email: primary.email,
          phone: primary.phone,
          location: primary.location,
          position: primary.position,
          profile_urls: primary.profile_urls,
          contacts,
          company_name: companyName || null,
          company_email: form.companyEmail.trim() || null,
          website: website || null,
          industry: form.industry.trim() || null,
          ...(form.status ? { status: form.status } : {}),
          ...(form.pipelineId ? { pipeline_id: Number(form.pipelineId) } : {}),
          priority: form.priority as (typeof PRIORITIES)[number],
          source: form.source.trim() || null,
          next_action: form.nextAction.trim() || null,
          last_interaction: form.lastInteraction.trim() || null,
          last_interaction_at: fromDateTimeLocal(form.lastInteractionAt),
          budget_amount: budgetAmount,
          budget_currency: budgetAmount !== null ? form.budgetCurrency : null,
          company_location_id: form.companyLocationId ? Number(form.companyLocationId) : null,
          // No assignee: reassigning a lead stays a manager action.
          custom_fields: serializeCustomFields(visibleFields, editCustomFields),
        },
      },
      {
        onSuccess: () => setEditMode(false),
        onError: (err) => showApiErrorToast(err, 'Could not save lead'),
      },
    );
  };

  const handleCancelEdit = () => {
    if (lead) setEditCustomFields(formValuesFromLead(leadFields, lead.customFields));
    setForm(null);
    setEditMode(false);
  };

  const currentLabelInfo = labels.find((l) => l.slug === lead?.status);
  const currencyOptions: string[] = form && !(BUDGET_CURRENCIES as readonly string[]).includes(form.budgetCurrency)
    ? [...BUDGET_CURRENCIES, form.budgetCurrency]
    : [...BUDGET_CURRENCIES];
  const linkedLocationMissing = Boolean(form?.companyLocationId)
    && !savedLocations.some((location) => String(location.id) === form?.companyLocationId);
  const budgetLabel = lead?.budgetAmount != null
    ? `${lead.budgetCurrency ?? ''} ${lead.budgetAmount.toLocaleString()}`.trim()
    : null;

  return (
    <ScreenErrorBoundary screenName="LeadDetail">
      <div className="relative min-h-screen bg-[#0A1D25] text-white flex flex-col font-sans select-none overflow-hidden pb-10">
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top,0px)+24px)] mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={goBack}
              className="w-10 h-10 flex items-center justify-center text-3xl font-light text-white/90 hover:text-white transition-colors focus:outline-none"
              aria-label="Go back"
            >
              ‹
            </button>
            <h2 className="font-bold text-lg text-white truncate max-w-[200px]">
              {isLoading ? 'Loading…' : lead?.name ?? 'Lead Detail'}
            </h2>
          </div>

          {!isLoading && lead && (
            <button
              onClick={() => (editMode ? handleCancelEdit() : startEdit())}
              disabled={isUpdating}
              className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.12] disabled:opacity-50 text-[#44AFCD] font-semibold text-xs rounded-full border border-white/[0.15] transition-all active:scale-95"
            >
              {editMode ? 'Cancel' : 'Edit'}
            </button>
          )}
        </div>

        {/* Content Wrapper */}
        <div className="relative z-10 flex-1 px-5 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#44AFCD] border-t-transparent" />
            </div>
          ) : isError || !lead ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
              <p className="text-sm text-white/60">Failed to load lead details.</p>
              <button
                onClick={goBack}
                className="px-6 py-2 bg-white/[0.08] text-[#44AFCD] text-xs font-semibold rounded-full hover:bg-white/[0.12] transition-colors"
              >
                Go Back
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Header card with name and current status badge */}
              <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg">
                <h3 className="font-bold text-xl text-white mb-2">{lead.name}</h3>
                {currentLabelInfo && (
                  <div className="flex items-center gap-2 text-xs font-medium text-white/80 mb-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: currentLabelInfo.color }}
                    />
                    <span>{currentLabelInfo.name}</span>
                  </div>
                )}
                {lead.updatedAt && (
                  <p className="text-[10px] text-white/40">
                    Last updated: {new Date(lead.updatedAt).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* Status Picker */}
              {labels.length > 0 && !editMode && (
                <div className="relative bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg">
                  <StatusPicker
                    currentStatus={lead.status}
                    labels={labels}
                    onSelect={handleStatusChange}
                  />
                  {isUpdating && (
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] rounded-2xl flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#44AFCD] border-t-transparent" />
                      <span className="text-xs text-[#44AFCD] font-medium">Saving…</span>
                    </div>
                  )}
                </div>
              )}

              {/* Information Section */}
              <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg flex flex-col">
                <h4 className="font-bold text-sm text-white mb-4">Lead Information</h4>

                {editMode && form ? (
                  <div className="flex flex-col gap-4">
                    <SectionTitle>Contacts</SectionTitle>
                    {form.contacts.map((contact, index) => (
                      <div key={index} className="flex flex-col gap-3 rounded-xl border border-white/10 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white/70">
                            Contact {index + 1}{index === 0 ? ' · Primary' : ''}
                          </span>
                          {form.contacts.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeContact(index)}
                              className="text-[11px] font-semibold text-[#FD6046]"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <Field label="Name *">
                          <input className={inputClass} value={contact.name} placeholder="Full name"
                            onChange={(e) => setContact(index, { name: e.target.value })} />
                        </Field>
                        <Field label="Email">
                          <input type="email" className={inputClass} value={contact.email} placeholder="Email address"
                            onChange={(e) => setContact(index, { email: e.target.value })} />
                        </Field>
                        <Field label="Phone">
                          <div className="flex gap-2 w-full">
                            <select
                              aria-label={`Contact ${index + 1} country code`}
                              value={contact.countryCode}
                              onChange={(e) => setContact(index, { countryCode: e.target.value })}
                              className="shrink-0 bg-white/[0.08] text-white text-sm border border-white/15 focus:border-[#44AFCD]/50 rounded-xl px-3 py-2.5 focus:outline-none transition-all"
                              style={optionStyle}
                            >
                              {COUNTRY_CODES.map((c) => (
                                <option key={c.code} value={c.code} style={optionStyle}>{c.code}</option>
                              ))}
                            </select>
                            <input type="tel" className={`${inputClass} min-w-0 flex-1`} value={contact.phonePart}
                              placeholder="Phone number"
                              onChange={(e) => setContact(index, { phonePart: e.target.value })} />
                          </div>
                        </Field>
                        <Field label="Location">
                          <input className={inputClass} value={contact.location} placeholder="Location"
                            onChange={(e) => setContact(index, { location: e.target.value })} />
                        </Field>
                        <Field label="Position">
                          <input className={inputClass} value={contact.position} placeholder="E.g Head of Sales"
                            onChange={(e) => setContact(index, { position: e.target.value })} />
                        </Field>
                        <Field label="Profile URLs (one per line)">
                          <textarea className={`${inputClass} min-h-[64px]`} value={contact.profileUrls}
                            placeholder="https://linkedin.com/in/username"
                            onChange={(e) => setContact(index, { profileUrls: e.target.value })} />
                        </Field>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addContact}
                      className="self-start text-xs font-semibold text-[#44AFCD]"
                    >
                      + Add another contact
                    </button>

                    <SectionTitle>Company</SectionTitle>
                    <Field label="Company name">
                      <input className={inputClass} value={form.companyName} placeholder="Company name"
                        onChange={(e) => setField('companyName', e.target.value)} />
                    </Field>
                    <Field label="Company email">
                      <input type="email" className={inputClass} value={form.companyEmail} placeholder="hello@company.com"
                        onChange={(e) => setField('companyEmail', e.target.value)} />
                    </Field>
                    <Field label="Website">
                      <input type="url" className={inputClass} value={form.website} placeholder="https://company.com"
                        onChange={(e) => setField('website', e.target.value)} />
                    </Field>
                    <Field label="Industry">
                      <input className={inputClass} value={form.industry} maxLength={120} placeholder="E.g Technology"
                        onChange={(e) => setField('industry', e.target.value)} />
                    </Field>

                    <SectionTitle>Lead details</SectionTitle>
                    {labels.length > 0 && (
                      <Field label="Status">
                        <select className={selectClass} style={optionStyle} value={form.status}
                          onChange={(e) => setField('status', e.target.value)}>
                          {labels.map((label) => (
                            <option key={label.slug} value={label.slug} style={optionStyle}>{label.name}</option>
                          ))}
                        </select>
                      </Field>
                    )}
                    {pipelines.length > 0 && (
                      <Field label="Pipeline">
                        <select className={selectClass} style={optionStyle} value={form.pipelineId}
                          onChange={(e) => setField('pipelineId', e.target.value)}>
                          {pipelines.map((pipeline) => (
                            <option key={pipeline.id} value={String(pipeline.id)} style={optionStyle}>{pipeline.name}</option>
                          ))}
                        </select>
                      </Field>
                    )}
                    <Field label="Priority">
                      <select className={selectClass} style={optionStyle} value={form.priority}
                        onChange={(e) => setField('priority', e.target.value)}>
                        {PRIORITIES.map((priority) => (
                          <option key={priority} value={priority} style={optionStyle}>
                            {priority.charAt(0).toUpperCase() + priority.slice(1)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Source">
                      <input className={inputClass} value={form.source} placeholder="E.g Referral"
                        onChange={(e) => setField('source', e.target.value)} />
                    </Field>
                    <Field label="Next action">
                      <input className={inputClass} value={form.nextAction} placeholder="E.g Call to follow up"
                        onChange={(e) => setField('nextAction', e.target.value)} />
                    </Field>
                    <Field label="Last interaction">
                      <input className={inputClass} value={form.lastInteraction} maxLength={255} placeholder="E.g Sent invoice"
                        onChange={(e) => setField('lastInteraction', e.target.value)} />
                    </Field>
                    <Field label="Interaction date">
                      <input type="datetime-local" className={inputClass} style={{ colorScheme: 'dark' }}
                        value={form.lastInteractionAt}
                        onChange={(e) => setField('lastInteractionAt', e.target.value)} />
                    </Field>
                    <Field label="Budget">
                      <div className="flex gap-2 w-full">
                        <select aria-label="Budget currency" className="shrink-0 bg-white/[0.08] text-white text-sm border border-white/15 rounded-xl px-3 py-2.5 focus:outline-none"
                          style={optionStyle} value={form.budgetCurrency}
                          onChange={(e) => setField('budgetCurrency', e.target.value)}>
                          {currencyOptions.map((code) => (
                            <option key={code} value={code} style={optionStyle}>{code}</option>
                          ))}
                        </select>
                        <input type="number" min="0" step="any" inputMode="decimal" aria-label="Budget amount"
                          className={`${inputClass} min-w-0 flex-1`} value={form.budgetAmount} placeholder="E.g 10000"
                          onChange={(e) => setField('budgetAmount', e.target.value)} />
                      </div>
                    </Field>
                    <Field label="Map link">
                      <select className={selectClass} style={optionStyle} value={form.companyLocationId}
                        onChange={(e) => setField('companyLocationId', e.target.value)}>
                        <option value="" style={optionStyle}>Not linked</option>
                        {savedLocations.map((location) => (
                          <option key={location.id} value={String(location.id)} style={optionStyle}>
                            {location.address ? `${location.name} · ${location.address}` : location.name}
                          </option>
                        ))}
                        {linkedLocationMissing && (
                          <option value={form.companyLocationId} style={optionStyle}>
                            Linked location #{form.companyLocationId}
                          </option>
                        )}
                      </select>
                    </Field>
                    <p className="text-[11px] text-white/40">
                      Assigned to {lead.assignee?.name ?? 'nobody'}. Ask a manager to reassign this lead.
                    </p>

                    {/* Save Button */}
                    <button
                      onClick={handleSaveEdit}
                      disabled={isUpdating}
                      className="w-full h-12 flex items-center justify-center bg-[#FD6046] hover:bg-[#E0533C] text-white text-sm font-semibold rounded-xl mt-3 active:scale-95 disabled:opacity-60 transition-all"
                    >
                      {isUpdating ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        'Save Changes'
                      )}
                    </button>
                  </div>
                ) : (() => {
                  const displayContacts: LeadContact[] = lead.contacts && lead.contacts.length > 0
                    ? lead.contacts
                    : [{ name: lead.name, email: lead.email, phone: lead.phone, location: lead.location, position: lead.position, profile_urls: lead.profileUrls }];

                  return (
                    <div className="flex flex-col gap-4">
                      <LeadContactsStack contacts={displayContacts} />
                      <div className="flex flex-col border-t border-white/5 pt-3">
                        <InfoRow label="Company" value={lead.companyName} />
                        <InfoRow label="Company email" value={lead.companyEmail} />
                        <InfoRow label="Website" value={lead.website} />
                        <InfoRow label="Industry" value={lead.industry} />
                        <InfoRow label="Source" value={lead.source} />
                        <InfoRow label="Priority" value={lead.priority} />
                        <InfoRow label="Next Action" value={lead.nextAction} />
                        <InfoRow label="Last Interaction" value={lead.lastInteraction} />
                        <InfoRow
                          label="Interaction Date"
                          value={lead.lastInteractionAt ? new Date(lead.lastInteractionAt).toLocaleString() : null}
                        />
                        <InfoRow label="Budget" value={budgetLabel} />
                        <InfoRow label="Map Link" value={lead.companyLocationId != null ? 'Linked' : null} />
                        {!lead.email && !lead.phone && !lead.location && !lead.source && (
                          <p className="text-xs text-white/40 italic">
                            No additional information available.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg">
                <h4 className="font-bold text-sm text-white mb-4">Custom fields</h4>
                <PwaCustomFields
                  fields={visibleFields}
                  values={editMode ? editCustomFields : formValuesFromLead(visibleFields, lead.customFields)}
                  disabled={!editMode}
                  agentNotice={editMode}
                  onChange={(key, value) => setEditCustomFields((current) => ({ ...current, [key]: value }))}
                  onAddField={editMode ? () => setShowFieldDialog(true) : undefined}
                />
              </div>

              {/* Assignment Section */}
              {(lead.creator || lead.assignee || lead.pipeline) && !editMode && (
                <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg flex flex-col mb-10">
                  <h4 className="font-bold text-sm text-white mb-4">Assignment</h4>
                  <InfoRow label="Created by" value={lead.creator?.name} />
                  <InfoRow label="Assigned to" value={lead.assignee?.name ?? 'Unassigned'} />
                  {lead.pipeline && <InfoRow label="Pipeline" value={lead.pipeline.name} />}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <PwaAddLeadFieldSheet
        visible={showFieldDialog}
        isAgentContext={true}
        onClose={() => setShowFieldDialog(false)}
        onCreated={(field) => {
          setSessionFieldIds((current) => (current.includes(field.id) ? current : [...current, field.id]));
          setEditCustomFields((current) => ({
            ...current,
            [field.key]: field.type === 'checkbox' ? false : field.type === 'multi_select' ? [] : '',
          }));
        }}
      />
    </ScreenErrorBoundary>
  );
}
