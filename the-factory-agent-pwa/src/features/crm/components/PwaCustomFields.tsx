'use client';

import React, { useState } from 'react';

import { getActiveCompanyId } from '@/lib/storage/stores';
import { toast } from '@/lib/toast';
import { useCreateLeadField } from '../queries';
import { visibleLeadFields } from '../customFields';
import type { LeadCustomFields, LeadFieldDefinition } from '../types';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'multi_select', label: 'Multiple options' },
  { value: 'checkbox', label: 'Yes / No' },
  { value: 'url', label: 'URL' },
  { value: 'phone', label: 'Phone' },
] as const;

const inputClass = 'w-full bg-white/[0.08] text-white text-sm border border-white/15 focus:border-[#44AFCD]/50 rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder-white/30';

export function PwaCustomFields({
  fields,
  values,
  onChange,
  disabled = false,
  errors,
  visibility = 'create',
  onAddField,
}: {
  fields: LeadFieldDefinition[];
  values: LeadCustomFields;
  onChange: (key: string, value: LeadCustomFields[string]) => void;
  disabled?: boolean;
  errors?: Record<string, string>;
  visibility?: 'create' | 'all';
  onAddField?: () => void;
}) {
  const visible = visibleLeadFields(fields, visibility);
  if (visible.length === 0 && !onAddField) return null;

  return (
    <div className="flex flex-col gap-4">
      {visible.map((field) => (
        <label key={field.id} className="flex flex-col">
          <span className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-white/50">
            {field.label}
            {field.is_required && field.status === 'active' ? <span className="text-[#EF4444]">*</span> : null}
            {field.status === 'pending' ? (
              <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[9px] font-bold tracking-wide text-amber-200">
                Pending
              </span>
            ) : null}
          </span>
          <FieldControl field={field} value={values[field.key]} disabled={disabled} onChange={(value) => onChange(field.key, value)} />
          {errors?.[field.key] ? <span className="mt-1 text-[11px] text-[#EF4444]">{errors[field.key]}</span> : null}
        </label>
      ))}
      {onAddField && !disabled ? (
        <button type="button" onClick={onAddField} className="text-left text-xs font-semibold text-[#44AFCD]">
          Add field
        </button>
      ) : null}
      {onAddField ? (
        <p className="text-[11px] text-white/45">
          Fields you add stay visible and pending until a manager approves them.
        </p>
      ) : null}
    </div>
  );
}

function FieldControl({
  field,
  value,
  disabled,
  onChange,
}: {
  field: LeadFieldDefinition;
  value: LeadCustomFields[string];
  disabled: boolean;
  onChange: (value: LeadCustomFields[string]) => void;
}) {
  if (field.type === 'textarea') {
    return (
      <textarea
        value={typeof value === 'string' ? value : ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} min-h-20`}
      />
    );
  }

  if (field.type === 'checkbox') {
    return (
      <input
        type="checkbox"
        checked={value === true}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5"
      />
    );
  }

  if (field.type === 'select') {
    return (
      <select
        value={typeof value === 'string' ? value : ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      >
        <option value="">Select</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }

  if (field.type === 'multi_select') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-col gap-2">
        {field.options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              disabled={disabled}
              checked={selected.includes(option.value)}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...selected, option.value]
                  : selected.filter((item) => item !== option.value);
                onChange(next);
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }

  return (
    <input
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : field.type === 'phone' ? 'tel' : 'text'}
      value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass}
    />
  );
}

export function PwaAddLeadFieldSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<(typeof FIELD_TYPES)[number]['value']>('text');
  const [optionsText, setOptionsText] = useState('');
  const createField = useCreateLeadField({ onSuccess: () => onClose() });

  if (!visible) return null;

  const submit = () => {
    const companyId = getActiveCompanyId();
    const trimmed = label.trim();
    if (!companyId) {
      toast.error('Company context is missing. Please log in again.');
      return;
    }
    if (!trimmed) {
      toast.error('Enter a field name.');
      return;
    }
    const options = optionsText.split('\n').map((line) => line.trim()).filter(Boolean);
    if ((type === 'select' || type === 'multi_select') && options.length === 0) {
      toast.error('Add at least one option, one per line.');
      return;
    }
    createField.mutate({
      company_id: companyId,
      label: trimmed,
      type,
      options: options.length > 0 ? options : undefined,
      show_on_create: true,
      show_in_list: true,
    });
  };

  return (
    <div className="fixed inset-0 z-[11000] flex items-end justify-center bg-black/50">
      <button type="button" className="absolute inset-0" aria-label="Close add field" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-3xl border-t border-white/10 bg-[#0A1D25] px-6 pb-8 pt-5">
        <h3 className="mb-4 text-lg font-bold text-white">Add lead field</h3>
        <div className="flex flex-col gap-3">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Field name"
            className={inputClass}
          />
          <select value={type} onChange={(event) => setType(event.target.value as typeof type)} className={inputClass}>
            {FIELD_TYPES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          {(type === 'select' || type === 'multi_select') ? (
            <textarea
              value={optionsText}
              onChange={(event) => setOptionsText(event.target.value)}
              placeholder="One option per line"
              className={`${inputClass} min-h-24`}
            />
          ) : null}
          <button
            type="button"
            onClick={submit}
            disabled={createField.isPending}
            className="h-12 rounded-xl bg-[#FD6046] text-sm font-semibold text-white disabled:opacity-50"
          >
            {createField.isPending ? 'Adding…' : 'Add field'}
          </button>
        </div>
      </div>
    </div>
  );
}
