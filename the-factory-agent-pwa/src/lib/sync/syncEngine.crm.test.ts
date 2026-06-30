import { describe, expect, it } from 'vitest';

import { describeOfflineAction } from '../offline/queue';
import type { OfflineActionQueueEntry } from '../db/schema';

function entry(actionType: OfflineActionQueueEntry['actionType']): OfflineActionQueueEntry {
  return {
    actionType,
    payloadJson: '{}',
    companyId: 1,
    userId: '1',
    status: 'pending',
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    clientMutationId: 'test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('describeOfflineAction CRM types', () => {
  it('describes lead create actions', () => {
    expect(describeOfflineAction(entry('crm.lead.create'))).toBe('Create lead');
  });

  it('describes lead update actions', () => {
    expect(describeOfflineAction(entry('crm.lead.update'))).toBe('Update lead');
  });
});
