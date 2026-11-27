'use client';

/**
 * Full lead edit form shared by the agent and manager lead screens.
 * Managers also get the assignee picker; agents can't reassign (the API
 * rejects it), so they see who the lead is assigned to instead.
 */

import React from 'react';
import { formatPhoneNumber } from '@/lib/phone';

export const COUNTRY_CODES = [
  { code: '+44', label: 'GB (+44)' },
  { code: '+234', label: 'NG (+234)' },
  { code: '+254', label: 'KE (+254)' },
  { code: '+233', label: 'GH (+233)' },
  { code: '+27', label: 'ZA (+27)' },
  { code: '+1', label: 'US (+1)' },
] as const;

const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const;
type Priority = (typeof PRIORITIES)[number];
const BUDGET_CURRENCIES = ['GBP', 'USD', 'EUR', 'NGN', 'KES', 'GHS', 'ZAR', 'JPY', 'CAD', 'AUD'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The lead fields the form reads (agent and manager `Lead` types both fit). */
export type EditableLeadContact = {
  name: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  position?: string | null;
  profile_urls?: string[] | null;
};

export type EditableLead = {
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  position: string | null;
  profileUrls: string[];
  contacts: EditableLeadContact[];
  companyName: string | null;
  companyEmail: string | null;
  website: string | null;
  industry: string | null;
  status: string | null;
  pipelineId: number | null;
  priority: string | null;
  source: string | null;
  nextAction: string | null;
  lastInteraction: string | null;
  lastInteractionAt: string | null;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  companyLocationId: number | null;
  assignedToUserId: number | null;
};

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

export type LeadEditFormState = {
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
  /** '' = unassigned. Only sent by managers. */
  assignedToUserId: string;
};

export type LeadEditOption = { value: string; label: string };

const inputClass =
  'w-full bg-white/[0.08] text-white text-sm border border-white/15 focus:border-[#44AFCD]/50 rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder-white/30';
const selectClass =
  'w-full bg-white/[0.08] text-white text-sm border border-white/15 focus:border-[#44AFCD]/50 rounded-xl px-3 py-2.5 focus:outline-none transition-all';
const optionStyle = { backgroundColor: '#0A1D25' };

export function parsePhoneNumber(fullPhone: string | null | undefined): { countryCode: string; phonePart: string } {
  if (!fullPhone) return { countryCode: '+44', phonePart: '' };
  const sortedCodes = COUNTRY_CODES.map((c) => c.code as string).sort((a, b) => b.length - a.length);
  for (const code of sortedCodes) {
    if (fullPhone.startsWith(code)) {
      return { countryCode: code, phonePart: fullPhone.slice(code.length).trim() };
    }
  }
  return { countryCode: '+44', phonePart: fullPhone };
}

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

function toEditContact(
  contact: EditableLeadContact,
  fallback?: { position?: string | null; profileUrls?: string[] },
): EditContact {
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

export function buildLeadEditForm(lead: EditableLead): LeadEditFormState {
  const leadFallback = { position: lead.position, profileUrls: lead.profileUrls };
  const contacts = lead.contacts.length > 0
    // Older leads kept position/URLs only on the lead: seed contact 1 from it.
    ? lead.contacts.map((contact, index) => toEditContact(contact, index === 0 ? leadFallback : undefined))
    : [toEditContact({ name: lead.name, email: lead.email, phone: lead.phone, location: lead.location }, leadFallback)];
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
    assignedToUserId: lead.assignedToUserId != null ? String(lead.assignedToUserId) : '',
  };
}

export type LeadEditPayload = {
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  position: string | null;
  profile_urls: string[] | null;
  contacts: Array<{
    name: string;
    email: string | null;
    phone: string | null;
    location: string | null;
    position: string | null;
    profile_urls: string[] | null;
    sort_order: number;
  }>;
  company_name: string | null;
  company_email: string | null;
  website: string | null;
  industry: string | null;
  status?: string;
  pipeline_id?: number;
  priority: Priority;
  source: string | null;
  next_action: string | null;
  last_interaction: string | null;
  last_interaction_at: string | null;
  budget_amount: number | null;
  budget_currency: string | null;
  company_location_id: number | null;
  assigned_to_user_id?: number | null;
};

/**
 * Validate the form and build the update payload. Every contact keeps its own
 * position and URLs: the API replaces all contact rows on save, so anything
 * left out would be wiped.
 */
export function leadEditPayload(
  form: LeadEditFormState,
  options: { includeAssignee: boolean },
): { error: string } | { payload: LeadEditPayload } {
  for (const [index, contact] of form.contacts.entries()) {
    if (!contact.name.trim()) return { error: `Contact ${index + 1} needs a name.` };
    if (contact.email.trim() && !EMAIL_RE.test(contact.email.trim())) {
      return { error: `Contact ${index + 1} has an invalid email.` };
    }
    if (splitUrls(contact.profileUrls).some((url) => !isValidUrl(url))) {
      return { error: `Contact ${index + 1} has an invalid profile URL.` };
    }
  }
  if (form.companyEmail.trim() && !EMAIL_RE.test(form.companyEmail.trim())) {
    return { error: 'Enter a valid company email.' };
  }
  const website = normalizeUrl(form.website);
  if (website && !isValidUrl(website)) return { error: 'Enter a valid website.' };
  const budgetText = form.budgetAmount.replace(/,/g, '').trim();
  const budgetAmount = budgetText ? Number(budgetText) : null;
  if (budgetAmount !== null && (Number.isNaN(budgetAmount) || budgetAmount < 0)) {
    return { error: 'Enter a valid budget amount.' };
  }

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
  const priority = (PRIORITIES as readonly string[]).includes(form.priority) ? (form.priority as Priority) : 'medium';

  return {
    payload: {
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
      priority,
      source: form.source.trim() || null,
      next_action: form.nextAction.trim() || null,
      last_interaction: form.lastInteraction.trim() || null,
      last_interaction_at: fromDateTimeLocal(form.lastInteractionAt),
      budget_amount: budgetAmount,
      budget_currency: budgetAmount !== null ? form.budgetCurrency : null,
      company_location_id: form.companyLocationId ? Number(form.companyLocationId) : null,
      ...(options.includeAssignee
        ? { assigned_to_user_id: form.assignedToUserId ? Number(form.assignedToUserId) : null }
        : {}),
    },
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

export function LeadEditFields({
  form,
  onChange,
  statusOptions,
  pipelineOptions,
  locationOptions,
  assigneeOptions,
  assigneeName,
}: {
  form: LeadEditFormState;
  onChange: (update: (current: LeadEditFormState) => LeadEditFormState) => void;
  statusOptions: LeadEditOption[];
  pipelineOptions: LeadEditOption[];
  locationOptions: LeadEditOption[];
  /** Given for managers: shows the assignee picker. */
  assigneeOptions?: LeadEditOption[];
  /** Shown read-only when there is no picker. */
  assigneeName?: string | null;
}) {
  const setField = <K extends keyof LeadEditFormState>(key: K, value: LeadEditFormState[K]) =>
    onChange((current) => ({ ...current, [key]: value }));
  const setContact = (index: number, patch: Partial<EditContact>) =>
    onChange((current) => ({
      ...current,
      contacts: current.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  const addContact = () =>
    onChange((current) => ({
      ...current,
      contacts: [
        ...current.contacts,
        { name: '', email: '', countryCode: '+44', phonePart: '', location: '', position: '', profileUrls: '' },
      ],
    }));
  const removeContact = (index: number) =>
    onChange((current) =>
      current.contacts.length > 1 ? { ...current, contacts: current.contacts.filter((_, i) => i !== index) } : current,
    );

  const currencyOptions: string[] = (BUDGET_CURRENCIES as readonly string[]).includes(form.budgetCurrency)
    ? [...BUDGET_CURRENCIES]
    : [...BUDGET_CURRENCIES, form.budgetCurrency];
  const linkedLocationMissing = Boolean(form.companyLocationId)
    && !locationOptions.some((option) => option.value === form.companyLocationId);
  // Never let a missing people list turn a save into an accidental "unassign".
  const currentAssigneeMissing = Boolean(form.assignedToUserId)
    && !(assigneeOptions ?? []).some((option) => option.value === form.assignedToUserId);

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle>Contacts</SectionTitle>
      {form.contacts.map((contact, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-xl border border-white/10 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/70">
              Contact {index + 1}{index === 0 ? ' · Primary' : ''}
            </span>
            {form.contacts.length > 1 && (
              <button type="button" onClick={() => removeContact(index)} className="text-[11px] font-semibold text-[#FD6046]">
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
              <input type="tel" className={`${inputClass} min-w-0 flex-1`} value={contact.phonePart} placeholder="Phone number"
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
      <button type="button" onClick={addContact} className="self-start text-xs font-semibold text-[#44AFCD]">
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
      {statusOptions.length > 0 && (
        <Field label="Status">
          <select className={selectClass} style={optionStyle} value={form.status}
            onChange={(e) => setField('status', e.target.value)}>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value} style={optionStyle}>{option.label}</option>
            ))}
          </select>
        </Field>
      )}
      {pipelineOptions.length > 0 && (
        <Field label="Pipeline">
          <select className={selectClass} style={optionStyle} value={form.pipelineId}
            onChange={(e) => setField('pipelineId', e.target.value)}>
            {pipelineOptions.map((option) => (
              <option key={option.value} value={option.value} style={optionStyle}>{option.label}</option>
            ))}
          </select>
        </Field>
      )}
      {assigneeOptions && (
        <Field label="Assigned to">
          <select className={selectClass} style={optionStyle} value={form.assignedToUserId}
            onChange={(e) => setField('assignedToUserId', e.target.value)}>
            <option value="" style={optionStyle}>Unassigned</option>
            {assigneeOptions.map((option) => (
              <option key={option.value} value={option.value} style={optionStyle}>{option.label}</option>
            ))}
            {currentAssigneeMissing && (
              <option value={form.assignedToUserId} style={optionStyle}>{assigneeName ?? 'Current assignee'}</option>
            )}
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
          <select aria-label="Budget currency"
            className="shrink-0 bg-white/[0.08] text-white text-sm border border-white/15 rounded-xl px-3 py-2.5 focus:outline-none"
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
          {locationOptions.map((option) => (
            <option key={option.value} value={option.value} style={optionStyle}>{option.label}</option>
          ))}
          {linkedLocationMissing && (
            <option value={form.companyLocationId} style={optionStyle}>
              Linked location #{form.companyLocationId}
            </option>
          )}
        </select>
      </Field>
      {!assigneeOptions && (
        <p className="text-[11px] text-white/40">
          Assigned to {assigneeName ?? 'nobody'}. Ask a manager to reassign this lead.
        </p>
      )}
    </div>
  );
}

/** Read-only rows for the lead fields beyond the contacts. */
export function leadDetailRows(lead: EditableLead): Array<{ label: string; value: string | null }> {
  const budget = lead.budgetAmount != null
    ? `${lead.budgetCurrency ?? ''} ${lead.budgetAmount.toLocaleString()}`.trim()
    : null;
  return [
    { label: 'Company', value: lead.companyName },
    { label: 'Company email', value: lead.companyEmail },
    { label: 'Website', value: lead.website },
    { label: 'Industry', value: lead.industry },
    { label: 'Source', value: lead.source },
    { label: 'Priority', value: lead.priority },
    { label: 'Next Action', value: lead.nextAction },
    { label: 'Last Interaction', value: lead.lastInteraction },
    { label: 'Interaction Date', value: lead.lastInteractionAt ? new Date(lead.lastInteractionAt).toLocaleString() : null },
    { label: 'Budget', value: budget },
    { label: 'Map Link', value: lead.companyLocationId != null ? 'Linked' : null },
  ];
}
