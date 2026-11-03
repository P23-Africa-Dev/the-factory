import type { LeadCustomFields, LeadFieldDefinition } from './types';

export function visibleLeadFields(
  fields: LeadFieldDefinition[],
  visibility: 'create' | 'all' = 'create',
): LeadFieldDefinition[] {
  return fields.filter((field) => {
    if (field.status !== 'active' && field.status !== 'pending') return false;
    return visibility === 'all' || field.show_on_create;
  });
}

export function formValuesFromLead(
  fields: LeadFieldDefinition[],
  stored: LeadCustomFields | null | undefined,
): LeadCustomFields {
  const values: LeadCustomFields = {};
  fields.forEach((field) => {
    if (field.status !== 'active' && field.status !== 'pending') return;
    const current = stored?.[field.key];
    if (field.type === 'checkbox') {
      values[field.key] = current === true || current === 'true' || current === 'Yes' || current === 1;
      return;
    }
    if (field.type === 'multi_select') {
      values[field.key] = Array.isArray(current)
        ? current.map(String)
        : typeof current === 'string' && current
          ? current.split(',').map((item) => item.trim()).filter(Boolean)
          : [];
      return;
    }
    values[field.key] = current === null || current === undefined ? '' : String(current);
  });
  return values;
}

export function validateCustomFieldValues(
  fields: LeadFieldDefinition[],
  values: LeadCustomFields,
): Record<string, string> {
  const errors: Record<string, string> = {};
  fields.forEach((field) => {
    if (field.status !== 'active' || !field.is_required) return;
    const value = values[field.key];
    const empty = value === null
      || value === undefined
      || value === ''
      || value === false
      || (Array.isArray(value) && value.length === 0);
    if (empty) errors[field.key] = `${field.label} is required.`;
  });
  return errors;
}

export function serializeCustomFields(
  fields: LeadFieldDefinition[],
  values: LeadCustomFields,
): LeadCustomFields {
  const payload: LeadCustomFields = {};
  fields.forEach((field) => {
    if (field.status !== 'active' && field.status !== 'pending') return;
    const value = values[field.key];
    if (field.type === 'checkbox') {
      if (value === true || value === false) payload[field.key] = value;
      return;
    }
    if (Array.isArray(value)) {
      if (value.length > 0) payload[field.key] = value;
      return;
    }
    if (value === null || value === undefined || value === '') return;
    payload[field.key] = value;
  });
  return payload;
}
