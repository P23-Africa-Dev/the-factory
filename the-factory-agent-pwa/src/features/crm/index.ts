export type {
  Lead,
  LeadActor,
  LeadNote,
  LeadActivity,
  CrmLabel,
  CrmPipeline,
  AgentUploadOverview,
  CreateLeadPayload,
  UpdateLeadPayload,
  LeadFilters,
  LeadsResult,
  PaginationData,
} from './types';

export { crmKeys } from './queryKeys';
export { crmApi } from './api';

export {
  useLeads,
  useLead,
  useCrmLabels,
  useCrmPipelines,
  useAgentUploadsOverview,
  useCreateLead,
  useUpdateLead,
} from './queries';

export { useCrmNavigation } from './navigation';
export { leadSchema, leadListSchema, crmLabelSchema, crmPipelineSchema } from './schema';

export { LeadCard } from './components/LeadCard';
export { AddLeadModal } from './components/AddLeadModal';
