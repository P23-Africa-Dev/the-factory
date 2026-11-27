'use client';

import React, { useState, useEffect, use } from 'react';
import { Trash2, MessageSquarePlus, Activity } from 'lucide-react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import {
  useLead,
  useCrmLabels,
  useLeadFields,
  useUpdateLead,
  useDeleteLead,
  useAddLeadNote,
  useAddLeadActivity,
  useCrmAssignees,
  useCrmPipelines,
  useCrmNavigation,
  type CrmLabel,
  LeadContactsStack,
  type LeadContact,
  type LeadCustomFields,
} from '@/manager/features/crm';
import {
  formValuesFromLead,
  serializeCustomFields,
  validateCustomFieldValues,
  visibleLeadFieldsForDetail,
} from '@/manager/features/crm/customFields';
import { PwaAddLeadFieldSheet, PwaCustomFields } from '@/manager/features/crm/components/PwaCustomFields';
import { useSavedLocations } from '@/manager/features/locations/queries';
import {
  LeadEditFields,
  buildLeadEditForm,
  leadDetailRows,
  leadEditPayload,
  type LeadEditFormState,
} from '@/components/crm/LeadEditForm';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { toast } from '@/lib/toast';
import { showApiErrorToast } from '@/lib/api/errors';

interface LeadDetailPageProps {
  params: Promise<{ id: string }>;
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col border-b border-white/5 py-3 last:border-none">
      <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1">
        {label}
      </span>
      <span className="text-sm font-medium text-white leading-relaxed">{value}</span>
    </div>
  );
}

function StatusPicker({
  currentStatus,
  labels,
  onSelect,
}: {
  currentStatus: string | null;
  labels: CrmLabel[];
  onSelect: (slug: string) => void;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3">
        Select Status
      </span>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none select-none">
        {labels.map((label) => {
          const isActive = currentStatus === label.slug;
          return (
            <button
              key={label.slug}
              onClick={() => onSelect(label.slug)}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap active:scale-95"
              style={{
                backgroundColor: isActive ? label.color : 'rgba(255,255,255,0.08)',
                borderColor: isActive ? label.color : 'rgba(255,255,255,0.15)',
                color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.6)',
              }}
            >
              {label.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { id } = use(params);
  const { goBack } = useCrmNavigation();

  const { data: lead, isLoading, isError } = useLead(id);
  const { data: labels = [] } = useCrmLabels();
  const { data: leadFields = [] } = useLeadFields();
  const { data: assignees = [] } = useCrmAssignees();
  const { data: pipelines = [] } = useCrmPipelines();
  const { data: savedLocations = [] } = useSavedLocations();
  const { mutate: updateLead, isPending: isUpdating } = useUpdateLead({
    onSuccess: () => {
      toast.success('Lead updated successfully');
    },
  });
  const deleteLeadMutation = useDeleteLead();
  const addNoteMutation = useAddLeadNote(id);
  const addActivityMutation = useAddLeadActivity(id);

  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<LeadEditFormState | null>(null);
  const [editCustomFields, setEditCustomFields] = useState<LeadCustomFields>({});
  const [showFieldDialog, setShowFieldDialog] = useState(false);
  const [sessionFieldIds, setSessionFieldIds] = useState<number[]>([]);
  const visibleFields = visibleLeadFieldsForDetail(leadFields, lead?.customFields, sessionFieldIds);

  // Manager note & activity inputs
  const [noteInput, setNoteInput] = useState('');
  const [activityType, setActivityType] = useState('call');
  const [activityTitle, setActivityTitle] = useState('');

  // Keep the custom field values in step with the loaded lead while not editing.
  useEffect(() => {
    if (lead && !editMode) {
      setTimeout(() => setEditCustomFields(formValuesFromLead(leadFields, lead.customFields)), 0);
    }
  }, [lead, leadFields, editMode]);

  const startEdit = () => {
    if (!lead) return;
    setForm(buildLeadEditForm(lead));
    setEditCustomFields(formValuesFromLead(leadFields, lead.customFields));
    setEditMode(true);
  };

  const handleStatusChange = (slug: string) => {
    if (!lead) return;
    const companyId = getActiveCompanyId();
    if (!companyId) {
      toast.error('No active company selected');
      return;
    }
    updateLead(
      {
        id: lead.id,
        payload: { company_id: companyId, status: slug },
      },
      {
        onError: (err) => showApiErrorToast(err, 'Could not update lead status'),
      },
    );
  };

  const handleReassignLead = (assigneeIdStr: string) => {
    if (!lead) return;
    const companyId = getActiveCompanyId();
    if (!companyId) return;
    const nextAssigneeId = assigneeIdStr ? Number(assigneeIdStr) : null;
    updateLead(
      {
        id: lead.id,
        payload: { company_id: companyId, assigned_to_user_id: nextAssigneeId },
      },
      {
        onError: (err) => showApiErrorToast(err, 'Could not reassign lead'),
      },
    );
  };

  const handleAddNote = async () => {
    if (!lead || !noteInput.trim()) return;
    try {
      await addNoteMutation.mutateAsync(noteInput.trim());
      setNoteInput('');
      toast.success('Note added to lead.');
    } catch (err) {
      showApiErrorToast(err, 'Could not add note');
    }
  };

  const handleLogActivity = async () => {
    if (!lead || !activityTitle.trim()) return;
    try {
      await addActivityMutation.mutateAsync({
        type: activityType,
        title: activityTitle.trim(),
      });
      setActivityTitle('');
      toast.success('Activity logged.');
    } catch (err) {
      showApiErrorToast(err, 'Could not log activity');
    }
  };

  const handleDeleteLead = async () => {
    if (!lead) return;
    try {
      await deleteLeadMutation.mutateAsync(lead.id);
      toast.success('Lead deleted.');
      goBack();
    } catch (err) {
      showApiErrorToast(err, 'Could not delete lead');
    }
  };

  const handleSaveEdit = () => {
    if (!lead || !form) return;
    const companyId = getActiveCompanyId();
    if (!companyId) {
      toast.error('No active company selected');
      return;
    }
    // Managers can also reassign the lead from the form.
    const result = leadEditPayload(form, { includeAssignee: true });
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    const customErrors = validateCustomFieldValues(leadFields, editCustomFields);
    const firstCustomError = Object.values(customErrors)[0];
    if (firstCustomError) {
      toast.error(firstCustomError);
      return;
    }

    updateLead(
      {
        id: lead.id,
        payload: {
          company_id: companyId,
          ...result.payload,
          custom_fields: serializeCustomFields(visibleFields, editCustomFields),
        },
      },
      {
        onSuccess: () => setEditMode(false),
        onError: (err) => showApiErrorToast(err, 'Could not save lead'),
      },
    );
  };

  const handleCancelEdit = () => {
    if (lead) setEditCustomFields(formValuesFromLead(leadFields, lead.customFields));
    setForm(null);
    setEditMode(false);
  };

  const currentLabelInfo = labels.find((l) => l.slug === lead?.status);

  return (
    <ScreenErrorBoundary screenName="LeadDetail">
      <div className="relative min-h-screen bg-[#0A1D25] text-white flex flex-col font-sans select-none overflow-x-hidden pb-16">
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between gap-2 px-5 pt-[calc(env(safe-area-inset-top,0px)+24px)] mb-6">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={goBack}
              className="w-10 h-10 shrink-0 flex items-center justify-center text-3xl font-light text-white/90 hover:text-white transition-colors focus:outline-none"
              aria-label="Go back"
            >
              ‹
            </button>
            <h2 className="font-bold text-lg text-white truncate min-w-0">
              {isLoading ? 'Loading…' : lead?.name ?? 'Lead Detail'}
            </h2>
          </div>

          {!isLoading && lead && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => (editMode ? handleCancelEdit() : startEdit())}
                disabled={isUpdating}
                className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.12] disabled:opacity-50 text-[#44AFCD] font-semibold text-xs rounded-full border border-white/[0.15] transition-all active:scale-95"
              >
                {editMode ? 'Cancel' : 'Edit'}
              </button>
              <button
                type="button"
                onClick={handleDeleteLead}
                disabled={deleteLeadMutation.isPending}
                className="p-2 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400"
                title="Delete Lead"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Content Wrapper */}
        <div className="relative z-10 flex-1 px-5 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#44AFCD] border-t-transparent" />
            </div>
          ) : isError || !lead ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
              <p className="text-sm text-white/60">Failed to load lead details.</p>
              <button
                onClick={goBack}
                className="px-6 py-2 bg-white/[0.08] text-[#44AFCD] text-xs font-semibold rounded-full hover:bg-white/[0.12] transition-colors"
              >
                Go Back
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 pb-10">
              {/* Header card with name and current status badge */}
              <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg">
                <h3 className="font-bold text-xl text-white mb-2">{lead.name}</h3>
                {currentLabelInfo && (
                  <div className="flex items-center gap-2 text-xs font-medium text-white/80 mb-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: currentLabelInfo.color }}
                    />
                    <span>{currentLabelInfo.name}</span>
                  </div>
                )}
                {lead.updatedAt && (
                  <p className="text-[10px] text-white/40">
                    Last updated: {new Date(lead.updatedAt).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* Status Picker */}
              {labels.length > 0 && !editMode && (
                <div className="relative bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg">
                  <StatusPicker
                    currentStatus={lead.status}
                    labels={labels}
                    onSelect={handleStatusChange}
                  />
                  {isUpdating && (
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] rounded-2xl flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#44AFCD] border-t-transparent" />
                      <span className="text-xs text-[#44AFCD] font-medium">Saving…</span>
                    </div>
                  )}
                </div>
              )}

              {/* Manager Assignment & Reassignment Card */}
              {!editMode && (
                <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-white">Assignment &amp; Owner</h4>
                    <span className="text-[10px] text-[#75ADAF] font-semibold">Manager Control</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                      Assigned Representative
                    </label>
                    <select
                      value={lead.assignedToUserId ?? ''}
                      onChange={(e) => handleReassignLead(e.target.value)}
                      disabled={isUpdating}
                      className="h-11 rounded-xl bg-white/[0.08] border border-white/15 px-3 text-xs font-semibold text-white focus:outline-none"
                      style={{ backgroundColor: '#0B3343' }}
                    >
                      <option value="">Unassigned</option>
                      {assignees.map((rep) => (
                        <option key={rep.id} value={rep.id}>
                          {rep.name} ({rep.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  <InfoRow label="Created by" value={lead.creator?.name} />
                  {lead.pipeline && <InfoRow label="Pipeline" value={lead.pipeline.name} />}
                </div>
              )}

              {/* Information Section */}
              <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg flex flex-col">
                <h4 className="font-bold text-sm text-white mb-4">Lead Information</h4>

                {editMode && form ? (
                  <div className="flex flex-col gap-4">
                    <LeadEditFields
                      form={form}
                      onChange={(update) => setForm((current) => (current ? update(current) : current))}
                      statusOptions={labels.map((label) => ({ value: label.slug, label: label.name }))}
                      pipelineOptions={pipelines.map((pipeline) => ({ value: String(pipeline.id), label: pipeline.name }))}
                      locationOptions={savedLocations.map((location) => ({
                        value: String(location.id),
                        label: location.address ? `${location.name} · ${location.address}` : location.name,
                      }))}
                      assigneeOptions={assignees.map((rep) => ({ value: String(rep.id), label: `${rep.name} (${rep.email})` }))}
                    />

                    <button
                      onClick={handleSaveEdit}
                      disabled={isUpdating}
                      className="w-full h-12 flex items-center justify-center bg-[#FD6046] hover:bg-[#E0533C] text-white text-sm font-semibold rounded-xl mt-3 active:scale-95 disabled:opacity-60 transition-all"
                    >
                      {isUpdating ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        'Save Changes'
                      )}
                    </button>
                  </div>
                ) : (
                  (() => {
                    const displayContacts: LeadContact[] =
                      lead.contacts && lead.contacts.length > 0
                        ? lead.contacts
                        : [{ name: lead.name, email: lead.email, phone: lead.phone, location: lead.location, position: lead.position, profile_urls: lead.profileUrls }];

                    return (
                      <div className="flex flex-col gap-4">
                        <LeadContactsStack contacts={displayContacts} />
                        <div className="flex flex-col border-t border-white/5 pt-3">
                          {leadDetailRows(lead).map((row) => (
                            <InfoRow key={row.label} label={row.label} value={row.value} />
                          ))}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>

              <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg">
                <h4 className="font-bold text-sm text-white mb-4">Custom fields</h4>
                <PwaCustomFields
                  fields={visibleFields}
                  values={editMode ? editCustomFields : formValuesFromLead(visibleFields, lead.customFields)}
                  disabled={!editMode}
                  agentNotice={editMode}
                  onChange={(key, value) => setEditCustomFields((current) => ({ ...current, [key]: value }))}
                  onAddField={editMode ? () => setShowFieldDialog(true) : undefined}
                />
              </div>

              {/* Lead Notes & Activity Log */}
              {!editMode && (
                <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg flex flex-col gap-4">
                  <h4 className="font-bold text-sm text-white flex items-center gap-2">
                    <MessageSquarePlus className="w-4 h-4 text-[#75ADAF]" />
                    Manager Notes &amp; Activity Log
                  </h4>

                  {/* Add Note Input */}
                  <div className="flex flex-col min-[360px]:flex-row gap-2">
                    <input
                      type="text"
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder="Write a note on this lead…"
                      className="min-w-0 flex-1 h-10 bg-white/[0.08] border border-white/15 rounded-xl px-3 text-xs text-white placeholder-white/40 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddNote}
                      disabled={addNoteMutation.isPending || !noteInput.trim()}
                      className="shrink-0 px-3.5 h-10 rounded-xl bg-[#75ADAF] text-[#0A1D25] font-bold text-xs disabled:opacity-50"
                    >
                      Add Note
                    </button>
                  </div>

                  {/* Log Activity Input */}
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={activityType}
                      onChange={(e) => setActivityType(e.target.value)}
                      className="shrink-0 h-10 bg-white/[0.08] border border-white/15 rounded-xl px-2.5 text-xs text-white focus:outline-none"
                      style={{ backgroundColor: '#0B3343' }}
                    >
                      <option value="call">Call</option>
                      <option value="visit">Visit</option>
                      <option value="email">Email</option>
                      <option value="meeting">Meeting</option>
                    </select>
                    <input
                      type="text"
                      value={activityTitle}
                      onChange={(e) => setActivityTitle(e.target.value)}
                      placeholder="Log interaction summary…"
                      className="min-w-[140px] flex-1 h-10 bg-white/[0.08] border border-white/15 rounded-xl px-3 text-xs text-white placeholder-white/40 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleLogActivity}
                      disabled={addActivityMutation.isPending || !activityTitle.trim()}
                      className="shrink-0 px-3 h-10 rounded-xl bg-[#FD6046] text-white font-bold text-xs disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      <Activity className="w-3.5 h-3.5" /> Log
                    </button>
                  </div>

                  {/* Existing Notes */}
                  {lead.notes && lead.notes.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                        Notes ({lead.notes.length})
                      </span>
                      {lead.notes.map((n) => (
                        <div key={n.id} className="p-3 rounded-xl bg-white/5 border border-white/5">
                          <p className="text-xs text-white/90">{n.note}</p>
                          <p className="text-[10px] text-white/40 mt-1">
                            {n.creator?.name ?? 'Team'} ·{' '}
                            {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Existing Activities */}
                  {lead.activities && lead.activities.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                        Activities ({lead.activities.length})
                      </span>
                      {lead.activities.map((act) => (
                        <div key={act.id} className="p-3 rounded-xl bg-white/5 border border-white/5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase text-[#75ADAF]">
                              {act.type}
                            </span>
                            <span className="text-[10px] text-white/40">
                              {act.created_at ? new Date(act.created_at).toLocaleDateString() : ''}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-white mt-0.5">
                            {act.title || act.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <PwaAddLeadFieldSheet
        visible={showFieldDialog}
        isAgentContext={false}
        onClose={() => setShowFieldDialog(false)}
        onCreated={(field) => {
          setSessionFieldIds((current) => (current.includes(field.id) ? current : [...current, field.id]));
          setEditCustomFields((current) => ({
            ...current,
            [field.key]: field.type === 'checkbox' ? false : field.type === 'multi_select' ? [] : '',
          }));
        }}
      />
    </ScreenErrorBoundary>
  );
}
