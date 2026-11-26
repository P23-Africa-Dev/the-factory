'use client';

import React, { useState } from 'react';
import { Building2, CalendarClock, ChevronRight, User } from 'lucide-react';
import { CrmPicker } from './CrmPicker';
import { isVisit, needsOutcome, type FormState } from './rules';
import { ACTIVITY_OPTIONS, OUTCOME_OPTIONS } from './types';

export function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-10 rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
        active ? 'border-[#44AFCD] bg-[#44AFCD] text-[#0A1D25]' : 'border-white/15 bg-white/5 text-white active:bg-white/10'
      }`}
    >
      {label}
    </button>
  );
}

export function Section({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-white/60">{title}</h3>
        {hint && <span className="text-[11px] text-white/40">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** What was done, with whom, how it went and notes: shared by the stop form and "Add a stop". */
export function StopDetailsFields({
  form,
  set,
  tried,
  initialLocationName = null,
}: {
  form: FormState;
  set: (patch: Partial<FormState>) => void;
  /** Save was tapped: highlight what is missing. */
  tried: boolean;
  initialLocationName?: string | null;
}) {
  const [picker, setPicker] = useState<'lead' | 'location' | null>(null);
  const [locationName, setLocationName] = useState<string | null>(initialLocationName);

  return (
    <>
      <Section title="What did you do here?">
        <div className={`flex flex-wrap gap-2 rounded-2xl ${tried && !form.activity ? 'p-1 ring-1 ring-[#FD6046]' : ''}`}>
          {ACTIVITY_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} active={form.activity === o.value} onClick={() => set({ activity: o.value })} />
          ))}
        </div>
        {form.activity && <p className="text-[11px] text-white/45">{ACTIVITY_OPTIONS.find((o) => o.value === form.activity)?.hint}</p>}
      </Section>

      {(form.activity === 'customer_visit' || form.activity === 'lead_visit') && (
        <Section title={form.activity === 'customer_visit' ? 'Customer' : 'Lead (optional)'}>
          <button
            type="button"
            onClick={() => setPicker('lead')}
            className={`flex min-h-12 w-full items-center gap-3 rounded-2xl border bg-[#0E2A36] px-3 text-left ${
              tried && form.activity === 'customer_visit' && !form.leadId ? 'border-[#FD6046]' : 'border-white/12'
            }`}
          >
            <User size={16} className="text-[#44AFCD]" />
            <span className={`flex-1 truncate text-[14px] ${form.leadName || form.leadId ? '' : 'text-white/50'}`}>
              {form.leadName || (form.leadId ? `Lead #${form.leadId}` : 'Choose from your CRM')}
            </span>
            <ChevronRight size={16} className="text-white/40" />
          </button>
        </Section>
      )}

      {form.activity === 'org_visit' && (
        <Section title="Company location (optional)">
          <button
            type="button"
            onClick={() => setPicker('location')}
            className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-white/12 bg-[#0E2A36] px-3 text-left"
          >
            <Building2 size={16} className="text-[#44AFCD]" />
            <span className={`flex-1 truncate text-[14px] ${locationName || form.locationId ? '' : 'text-white/50'}`}>
              {locationName || (form.locationId ? `Location #${form.locationId}` : 'Choose a location')}
            </span>
            <ChevronRight size={16} className="text-white/40" />
          </button>
        </Section>
      )}

      {needsOutcome(form.activity) && (
        <Section title="How did it go?">
          <div className={`flex flex-wrap gap-2 rounded-2xl ${tried && !form.outcome ? 'p-1 ring-1 ring-[#FD6046]' : ''}`}>
            {OUTCOME_OPTIONS.map((o) => (
              <Chip key={o.value} label={o.label} active={form.outcome === o.value} onClick={() => set({ outcome: o.value })} />
            ))}
          </div>
          {form.outcome === 'follow_up' && (
            <label className="mt-2 flex h-12 items-center gap-2 rounded-2xl border border-white/12 bg-[#0E2A36] px-3">
              <CalendarClock size={16} className="text-[#FBBF24]" />
              <span className="text-[13px] text-white/70">Follow up on</span>
              <input
                type="date"
                value={form.followUpAt ?? ''}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => set({ followUpAt: e.target.value || null })}
                className="flex-1 bg-transparent text-right text-[14px] text-white outline-none [color-scheme:dark]"
              />
            </label>
          )}
        </Section>
      )}

      <Section title="Notes" hint={form.notes.length > 4500 ? `${form.notes.length}/5000` : undefined}>
        <textarea
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value.slice(0, 5000) })}
          rows={4}
          placeholder={isVisit(form.activity) ? 'Who you met, what was discussed, next steps…' : 'Anything worth noting (optional)'}
          className="w-full resize-none rounded-2xl border border-white/12 bg-[#0E2A36] p-3 text-[14px] leading-relaxed outline-none placeholder:text-white/35 focus:border-[#44AFCD]"
        />
      </Section>

      {picker && (
        <CrmPicker
          kind={picker}
          onClose={() => setPicker(null)}
          onPick={(p) => {
            if (picker === 'lead') set({ leadId: p.id, leadName: p.name });
            else {
              set({ locationId: p.id });
              setLocationName(p.name);
            }
            setPicker(null);
          }}
        />
      )}
    </>
  );
}
