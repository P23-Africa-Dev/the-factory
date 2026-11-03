import { describe, expect, it } from 'vitest';

import { serializeCustomFields, validateCustomFieldValues } from './customFields';
import { leadSchema } from './schema';
import type { LeadFieldDefinition } from './types';

const industry: LeadFieldDefinition = {
  id: 1,
  company_id: 12,
  key: 'industry',
  label: 'Industry',
  type: 'text',
  options: [],
  is_required: true,
  show_on_create: true,
  show_in_list: true,
  status: 'active',
  sort_order: 0,
};

describe('lead custom fields', () => {
  it('keeps custom field values on a lead and defaults a missing object', () => {
    const lead = leadSchema.parse({
      id: 4,
      company_id: 12,
      created_by_user_id: 7,
      name: 'Ada Lovelace',
      custom_fields: { industry: 'SaaS', headcount: 40 },
    });
    expect(lead.customFields).toEqual({ industry: 'SaaS', headcount: 40 });

    const withoutFields = leadSchema.parse({
      id: 5,
      company_id: 12,
      created_by_user_id: 7,
      name: 'Grace Hopper',
    });
    expect(withoutFields.customFields).toEqual({});
  });

  it('requires an active field and serializes a filled value', () => {
    expect(validateCustomFieldValues([industry], {})).toEqual({
      industry: 'Industry is required.',
    });
    expect(serializeCustomFields([industry], { industry: 'SaaS' })).toEqual({
      industry: 'SaaS',
    });
  });

  it('does not require a pending field', () => {
    expect(validateCustomFieldValues([{ ...industry, status: 'pending' }], {})).toEqual({});
  });
});
