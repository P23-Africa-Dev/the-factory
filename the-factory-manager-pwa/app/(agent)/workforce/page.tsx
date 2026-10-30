'use client';

import React, { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Users,
  Clock,
  UserPlus,
  Settings2,
  MapPin,
  ShieldCheck,
  Ban,
  CheckCircle2,
  X,
  Calendar,
} from 'lucide-react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import {
  useAdminAttendanceRecords,
  useAdminAttendanceSettings,
  useUpdateAttendanceSettingsMutation,
  useAgentAttendanceHistory,
} from '@/features/attendance';
import {
  useInternalUsers,
  useInviteInternalUser,
  useSuspendUser,
  useReactivateUser,
  useAssignSupervisor,
} from '@/features/workforce/api';
import { useManagerPermissions } from '@/features/auth';
import { toast } from '@/lib/toast';
import { showApiErrorToast } from '@/lib/api/errors';

type WorkforceTab = 'attendance' | 'directory';

function WorkforceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialUserId = searchParams.get('userId');

  const { canManageUsers, canManageAttendanceSettings } = useManagerPermissions();

  const [activeTab, setActiveTab] = useState<WorkforceTab>('attendance');
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectedUserId, setInspectedUserId] = useState<number | null>(
    initialUserId ? Number(initialUserId) : null,
  );
  const [showAttendanceSettings, setShowAttendanceSettings] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Attendance queries & mutations
  const { data: attendanceData, isLoading: isLoadingAttendance } =
    useAdminAttendanceRecords({ date: selectedDate });
  const attendanceRecords = useMemo(
    () => attendanceData?.records ?? [],
    [attendanceData],
  );
  const { data: attendanceSettings } = useAdminAttendanceSettings();
  const updateAttendanceSettings = useUpdateAttendanceSettingsMutation();
  const { data: agentHistoryData, isLoading: isLoadingHistory } =
    useAgentAttendanceHistory(inspectedUserId);
  const agentHistory = agentHistoryData?.records ?? [];

  // Attendance settings form state
  const [startTimeInput, setStartTimeInput] = useState('');
  const [endTimeInput, setEndTimeInput] = useState('');
  const [graceMinutesInput, setGraceMinutesInput] = useState('15');

  // Team directory queries & mutations
  const { data: internalUsers = [], isLoading: isLoadingUsers } = useInternalUsers(
    searchQuery.trim() ? { search: searchQuery.trim() } : undefined,
  );
  const inviteMutation = useInviteInternalUser();
  const suspendMutation = useSuspendUser();
  const reactivateMutation = useReactivateUser();
  const assignSupervisorMutation = useAssignSupervisor();

  // Invite form state
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'agent' | 'supervisor' | 'admin'>('agent');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteSupervisorId, setInviteSupervisorId] = useState<string>('');

  const supervisorsList = useMemo(
    () =>
      internalUsers.filter((u) => {
        const r = u.role.toLowerCase();
        return r === 'supervisor' || r === 'admin' || r === 'owner';
      }),
    [internalUsers],
  );

  const filteredAttendance = useMemo(() => {
    if (!searchQuery.trim()) return attendanceRecords;
    const q = searchQuery.toLowerCase();
    return attendanceRecords.filter(
      (r) =>
        r.user_name?.toLowerCase().includes(q) ||
        r.user_email?.toLowerCase().includes(q),
    );
  }, [attendanceRecords, searchQuery]);

  const handleSaveAttendanceSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateAttendanceSettings.mutateAsync({
        work_start_time: startTimeInput || attendanceSettings?.work_start_time || '08:00',
        work_end_time: endTimeInput || attendanceSettings?.work_end_time || '17:00',
        late_grace_minutes: Number(graceMinutesInput) || 15,
      });
      setShowAttendanceSettings(false);
      toast.success('Attendance schedule updated.');
    } catch (err) {
      showApiErrorToast(err, 'Could not update attendance settings');
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) {
      toast.error('Name and email are required.');
      return;
    }
    try {
      await inviteMutation.mutateAsync({
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        role: inviteRole,
        phone: invitePhone.trim() || null,
        supervisor_id: inviteSupervisorId ? Number(inviteSupervisorId) : null,
      });
      setInviteName('');
      setInviteEmail('');
      setInvitePhone('');
      setShowInviteModal(false);
      toast.success('Invitation sent.');
    } catch (err) {
      showApiErrorToast(err, 'Could not send invitation');
    }
  };

  const handleToggleSuspend = async (userId: number, currentlySuspended?: boolean) => {
    try {
      if (currentlySuspended) {
        await reactivateMutation.mutateAsync(userId);
        toast.success('Team member reactivated.');
      } else {
        await suspendMutation.mutateAsync(userId);
        toast.info('Team member suspended.');
      }
    } catch (err) {
      showApiErrorToast(err, 'Could not update member status');
    }
  };

  const handleSupervisorChange = async (userId: number, supervisorIdStr: string) => {
    try {
      await assignSupervisorMutation.mutateAsync({
        userId,
        supervisorId: supervisorIdStr ? Number(supervisorIdStr) : null,
      });
      toast.success('Supervisor updated.');
    } catch (err) {
      showApiErrorToast(err, 'Could not assign supervisor');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A1D25] text-white pb-24 pt-[calc(env(safe-area-inset-top,0px)+20px)] px-5 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-[#75ADAF]">
          <ArrowLeft size={16} />
          <Link href="/" className="text-xs font-bold uppercase tracking-wider">
            Dashboard
          </Link>
        </div>
        <Link
          href="/payroll"
          className="px-3 py-1.5 rounded-full bg-[#FD6046]/20 border border-[#FD6046]/40 text-[#FD6046] text-xs font-bold"
        >
          Payroll Hub →
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Workforce &amp; Attendance</h1>
          <p className="text-xs text-white/60 mt-1">
            Daily clock-in verification, attendance rules, and internal team directory.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManageAttendanceSettings && (
            <button
              type="button"
              onClick={() => {
                setStartTimeInput(attendanceSettings?.work_start_time ?? '08:00');
                setEndTimeInput(attendanceSettings?.work_end_time ?? '17:00');
                setGraceMinutesInput(String(attendanceSettings?.late_grace_minutes ?? 15));
                setShowAttendanceSettings((v) => !v);
              }}
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-white/80 hover:text-white"
              title="Attendance Schedule Settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}
          {canManageUsers && (
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="px-3.5 py-2.5 rounded-xl bg-[#FD6046] hover:bg-[#E0533C] text-white text-xs font-bold flex items-center gap-1.5 shadow-lg"
            >
              <UserPlus className="w-4 h-4" />
              Invite
            </button>
          )}
        </div>
      </div>

      {/* Attendance Settings Drawer */}
      {showAttendanceSettings && (
        <form
          onSubmit={handleSaveAttendanceSettings}
          className="mb-5 p-4 rounded-2xl bg-[#0B3343] border border-white/10 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#75ADAF]">
              Organization Attendance Rules
            </h3>
            <button
              type="button"
              onClick={() => setShowAttendanceSettings(false)}
              className="text-white/50 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[10px] text-white/60 mb-1">Start Time</label>
              <input
                type="time"
                value={startTimeInput}
                onChange={(e) => setStartTimeInput(e.target.value)}
                className="w-full h-10 rounded-xl bg-white/10 border border-white/15 px-2.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] text-white/60 mb-1">Close Time</label>
              <input
                type="time"
                value={endTimeInput}
                onChange={(e) => setEndTimeInput(e.target.value)}
                className="w-full h-10 rounded-xl bg-white/10 border border-white/15 px-2.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] text-white/60 mb-1">Grace (mins)</label>
              <input
                type="number"
                value={graceMinutesInput}
                onChange={(e) => setGraceMinutesInput(e.target.value)}
                className="w-full h-10 rounded-xl bg-white/10 border border-white/15 px-2.5 text-xs text-white"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={updateAttendanceSettings.isPending}
            className="w-full h-10 rounded-xl bg-[#75ADAF] text-[#0A1D25] font-bold text-xs"
          >
            {updateAttendanceSettings.isPending ? 'Saving…' : 'Save Attendance Rules'}
          </button>
        </form>
      )}

      {/* Mode Switcher Tabs */}
      <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('attendance')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'attendance'
              ? 'bg-[#75ADAF] text-[#0A1D25] shadow-md'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Daily Attendance ({attendanceRecords.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('directory')}
          className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'directory'
              ? 'bg-[#75ADAF] text-[#0A1D25] shadow-md'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Team Directory ({internalUsers.length})
        </button>
      </div>

      {/* Search & Date Filter Row */}
      <div className="flex items-center gap-2 mb-5">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter by member name or email…"
          className="flex-1 h-11 rounded-xl bg-white/[0.06] border border-white/10 px-3.5 text-xs text-white placeholder-white/40 focus:outline-none"
        />
        {activeTab === 'attendance' && (
          <div className="relative flex items-center">
            <Calendar className="w-3.5 h-3.5 text-[#75ADAF] absolute left-3 pointer-events-none" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-11 pl-8 pr-3 rounded-xl bg-[#0B3343] border border-white/15 text-xs font-semibold text-white focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* TAB 1: DAILY ATTENDANCE */}
      {activeTab === 'attendance' && (
        <div className="space-y-3">
          {isLoadingAttendance ? (
            <div className="py-16 flex justify-center">
              <div className="w-7 h-7 rounded-full border-3 border-[#75ADAF] border-t-transparent animate-spin" />
            </div>
          ) : filteredAttendance.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white/[0.04] border border-white/10 text-center text-xs text-white/50">
              No attendance records logged for {selectedDate}.
            </div>
          ) : (
            filteredAttendance.map((rec) => (
              <div
                key={rec.id}
                className="p-4 rounded-2xl bg-white/[0.05] border border-white/10 flex flex-col gap-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white">{rec.user_name}</h3>
                    <p className="text-[11px] text-white/50">
                      Clock In:{' '}
                      {rec.clock_in_at
                        ? new Date(rec.clock_in_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}{' '}
                      · Clock Out:{' '}
                      {rec.clock_out_at
                        ? new Date(rec.clock_out_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Active'}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      rec.status === 'late'
                        ? 'bg-amber-500/20 text-amber-300'
                        : rec.status === 'absent'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    {rec.status || 'present'}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setInspectedUserId(rec.user_id)}
                    className="text-[11px] font-semibold text-[#75ADAF] hover:underline"
                  >
                    View Attendance History
                  </button>

                  {rec.latitude != null && rec.longitude != null && (
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/map?clockInLat=${rec.latitude}&clockInLng=${rec.longitude}&clockInName=${encodeURIComponent(
                            rec.user_name ?? rec.agent_name ?? 'Agent',
                          )}`,
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-semibold text-white flex items-center gap-1"
                    >
                      <MapPin className="w-3 h-3 text-[#FD6046]" /> Clock-In Pin
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: TEAM DIRECTORY */}
      {activeTab === 'directory' && (
        <div className="space-y-3">
          {isLoadingUsers ? (
            <div className="py-16 flex justify-center">
              <div className="w-7 h-7 rounded-full border-3 border-[#75ADAF] border-t-transparent animate-spin" />
            </div>
          ) : internalUsers.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white/[0.04] border border-white/10 text-center text-xs text-white/50">
              No internal users matched your filter.
            </div>
          ) : (
            internalUsers.map((member) => (
              <div
                key={member.id}
                className="p-4 rounded-2xl bg-white/[0.05] border border-white/10 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#1D7293] text-white font-bold text-xs flex items-center justify-center shrink-0">
                      {member.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white truncate">{member.name}</h3>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-[#75ADAF]/20 text-[#75ADAF]">
                          {member.role}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/50 truncate">{member.email}</p>
                    </div>
                  </div>

                  {canManageUsers && member.role.toLowerCase() !== 'owner' && (
                    <button
                      type="button"
                      onClick={() => handleToggleSuspend(member.id, member.is_suspended)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 ${
                        member.is_suspended
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {member.is_suspended ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" /> Reactivate
                        </>
                      ) : (
                        <>
                          <Ban className="w-3 h-3" /> Suspend
                        </>
                      )}
                    </button>
                  )}
                </div>

                {canManageUsers && member.role.toLowerCase() === 'agent' && (
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#75ADAF]" /> Supervisor:
                    </span>
                    <select
                      value={member.supervisor_id ?? ''}
                      onChange={(e) => handleSupervisorChange(member.id, e.target.value)}
                      className="h-8 rounded-lg bg-[#0B3343] border border-white/15 px-2.5 text-[11px] text-white focus:outline-none"
                    >
                      <option value="">Unassigned</option>
                      {supervisorsList.map((sup) => (
                        <option key={sup.id} value={sup.id}>
                          {sup.name} ({sup.role})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Agent Attendance History Modal */}
      {inspectedUserId != null && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end justify-center p-4">
          <div className="w-full max-w-md bg-[#0B3343] border border-white/15 rounded-3xl p-5 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-sm font-bold text-white">Agent Attendance Log</h3>
              <button
                type="button"
                onClick={() => setInspectedUserId(null)}
                className="text-white/60 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-3 space-y-2">
              {isLoadingHistory ? (
                <p className="text-xs text-white/50 text-center py-8">Loading history…</p>
              ) : agentHistory.length === 0 ? (
                <p className="text-xs text-white/50 text-center py-8">No historical records found.</p>
              ) : (
                agentHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-xs font-bold text-white">{item.date}</p>
                      <p className="text-[10px] text-white/60">
                        In: {item.clock_in_at ? new Date(item.clock_in_at).toLocaleTimeString() : '—'}{' '}
                        · Out:{' '}
                        {item.clock_out_at ? new Date(item.clock_out_at).toLocaleTimeString() : '—'}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-white/10 text-[#75ADAF]">
                      {item.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invite Internal User Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end justify-center p-4">
          <form
            onSubmit={handleInviteSubmit}
            className="w-full max-w-md bg-[#0B3343] border border-white/15 rounded-3xl p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Invite Team Member</h3>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="text-white/60 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#75ADAF] mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="e.g. Chinedu Okafor"
                className="w-full h-11 rounded-xl bg-white/10 border border-white/15 px-3.5 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#75ADAF] mb-1">Email *</label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full h-11 rounded-xl bg-white/10 border border-white/15 px-3.5 text-xs text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#75ADAF] mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'agent' | 'supervisor' | 'admin')}
                  className="w-full h-11 rounded-xl bg-[#0A1D25] border border-white/15 px-3 text-xs text-white"
                >
                  <option value="agent">Field Agent</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#75ADAF] mb-1">Phone</label>
                <input
                  type="tel"
                  value={invitePhone}
                  onChange={(e) => setInvitePhone(e.target.value)}
                  placeholder="+234..."
                  className="w-full h-11 rounded-xl bg-white/10 border border-white/15 px-3 text-xs text-white"
                />
              </div>
            </div>

            {inviteRole === 'agent' && supervisorsList.length > 0 && (
              <div>
                <label className="block text-[11px] font-semibold text-[#75ADAF] mb-1">
                  Assign Supervisor
                </label>
                <select
                  value={inviteSupervisorId}
                  onChange={(e) => setInviteSupervisorId(e.target.value)}
                  className="w-full h-11 rounded-xl bg-[#0A1D25] border border-white/15 px-3 text-xs text-white"
                >
                  <option value="">No supervisor assigned</option>
                  {supervisorsList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="submit"
              disabled={inviteMutation.isPending}
              className="w-full h-12 rounded-xl bg-[#FD6046] hover:bg-[#E0533C] text-white font-bold text-xs shadow-lg"
            >
              {inviteMutation.isPending ? 'Sending Invite…' : 'Send Invitation'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function WorkforcePage() {
  return (
    <ScreenErrorBoundary screenName="WorkforceHub">
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#0A1D25] flex items-center justify-center">
            <div className="w-7 h-7 rounded-full border-3 border-[#75ADAF] border-t-transparent animate-spin" />
          </div>
        }
      >
        <WorkforceContent />
      </Suspense>
    </ScreenErrorBoundary>
  );
}

