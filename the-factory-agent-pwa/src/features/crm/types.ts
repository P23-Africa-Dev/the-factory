import type { z } from 'zod';
import type {
  leadActorSchema,
  leadNoteSchema,
  leadActivitySchema,
  leadSchema,
  crmLabelSchema,
  crmPipelineSchema,
  agentUploadOverviewSchema,
  createLeadPayloadSchema,
  updateLeadPayloadSchema,
  leadFiltersSchema,
} from './schema';

export type LeadActor = z.infer<typeof leadActorSchema>;
export type LeadNote = z.infer<typeof leadNoteSchema>;
export type LeadActivity = z.infer<typeof leadActivitySchema>;
export type Lead = z.infer<typeof leadSchema>;
export type CrmLabel = z.infer<typeof crmLabelSchema>;
export type CrmPipeline = z.infer<typeof crmPipelineSchema>;
export type AgentUploadOverview = z.infer<typeof agentUploadOverviewSchema>;
export type CreateLeadPayload = z.infer<typeof createLeadPayloadSchema>;
export type UpdateLeadPayload = z.infer<typeof updateLeadPayloadSchema>;
export type LeadFilters = z.infer<typeof leadFiltersSchema>;

export type PaginationData = {
  nextPageUrl: string | null;
  prevPageUrl: string | null;
  perPage: number;
  currentPage?: number;
  total?: number;
  lastPage?: number;
};

export type LeadsResult = {
  leads: Lead[];
  pagination: PaginationData;
};
