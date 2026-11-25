import type { LeadCustomFields, LeadFieldDefinition } from './types';

export function isActiveLeadField(field: LeadFieldDefinition): boolean {
  return field.status === 'active';
}

export function isUniversalLeadField(field: LeadFieldDefinition): boolean {
  return isActiveLeadField(field) && Boolean(field.is_universal);
}

export function isPendingUniversalRequest(field: LeadFieldDefinition): boolean {
  return isActiveLeadField(field) && field.universal_request_status === 'pending';
}

export function visibleLeadFieldsForCreate(
  fields: LeadFieldDefinition[],
  sessionFieldIds: Iterable<number | string> = [],
): LeadFieldDefinition[] {
  const session = new Set(Array.from(sessionFieldIds, (id) => Number(id)));
  return fields.filter((field) => {
    if (!isActiveLeadField(field)) return false;
    if (isUniversalLeadField(field) && field.show_on_create) return true;
    return session.has(Number(field.id));
  });
}

export function visibleLeadFieldsForDetail(
  fields: LeadFieldDefinition[],
  stored: LeadCustomFields | null | undefined,
  sessionFieldIds: Iterable<number | string> = [],
): LeadFieldDefinition[] {
  const source = stored && typeof stored === 'object' ? stored : {};
  const session = new Set(Array.from(sessionFieldIds, (id) => Number(id)));
  return fields.filter((field) => {
    if (!isActiveLeadField(field)) return false;
    if (isUniversalLeadField(field)) return true;
    if (session.has(Number(field.id))) return true;
    return Object.prototype.hasOwnProperty.call(source, field.key);
  });
}

/** @deprecated Prefer visibleLeadFieldsForCreate / ForDetail */
export function visibleLeadFields(
  fields: LeadFieldDefinition[],
  visibility: 'create' | 'all' = 'create',
): LeadFieldDefinition[] {
  if (visibility === 'all') {
    return visibleLeadFieldsForDetail(fields, Object.fromEntries(fields.map((field) => [field.key, ''])));
  }
  return visibleLeadFieldsForCreate(fields);
}

export function formValuesFromLead(
  fields: LeadFieldDefinition[],
  stored: LeadCustomFields | null | undefined,
): LeadCustomFields {
  const values: LeadCustomFields = {};
  fields.forEach((field) => {
    if (!isActiveLeadField(field)) return;
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
    if (!isUniversalLeadField(field) || !field.is_required) return;
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
    if (!isActiveLeadField(field)) return;
    const value = values[field.key];
    const keepLeadOnly = !field.is_universal && Object.prototype.hasOwnProperty.call(values, field.key);
    if (field.type === 'checkbox') {
      if (value === true || value === false) payload[field.key] = value;
      else if (keepLeadOnly) payload[field.key] = false;
      return;
    }
    if (Array.isArray(value)) {
      if (value.length > 0) payload[field.key] = value;
      else if (keepLeadOnly) payload[field.key] = [];
      return;
    }
    if (value === null || value === undefined || value === '') {
      if (keepLeadOnly) payload[field.key] = '';
      return;
    }
    payload[field.key] = value;
  });
  return payload;
}
