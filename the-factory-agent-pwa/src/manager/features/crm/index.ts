export type {
  Lead,
  LeadActor,
  LeadContact,
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
  LeadFieldDefinition,
  CreateLeadFieldPayload,
  LeadCustomFields,
} from './types';

export { crmKeys } from './queryKeys';
export { crmApi } from './api';
export type { CrmAssigneeOption, CrmAnalyticsData } from './api';

export {
  useLeads,
  useLead,
  useCrmAssignees,
  useCrmAnalytics,
  useCrmLabels,
  useCrmPipelines,
  useAgentUploadsOverview,
  useCreateLead,
  useUpdateLead,
  useDeleteLead,
  useAddLeadNote,
  useAddLeadActivity,
  useLeadFields,
  useCreateLeadField,
  useApproveLeadField,
  useDeclineLeadField,
} from './queries';

export { useCrmNavigation } from './navigation';
export { leadSchema, leadListSchema, crmLabelSchema, crmPipelineSchema } from './schema';

export { LeadCard } from './components/LeadCard';
export { AddLeadModal } from './components/AddLeadModal';
export { LeadContactsStack } from './components/LeadContactsStack';
