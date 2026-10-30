'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  format,
  isSameDay,
  parseISO,
  isValid,
  startOfDay,
  addDays,
} from 'date-fns';
import {
  Bell,
  Plus,
  Search,
  Sparkles,
  MapPin,
  Clock,
  Navigation,
  ChevronRight,
  Users,
  Briefcase,
  Activity,
  DollarSign,
  ArrowRightLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useAuth, useManagerIdentity, useManagerPermissions } from '@/features/auth';
import { useDashboardOverview, useWorkforceSummary } from '@/features/dashboard/api';
import {
  useTaskListItems,
  useTaskReassignmentsInbox,
  type Task,
} from '@/features/tasks';
import { useAgentUploadsOverview, AddLeadModal } from '@/features/crm';
import { AttendanceCard, useAttendanceMetrics } from '@/features/attendance';
import {
  FieldActivitySummaryCard,
} from '@/features/field-activity';
import {
  useMeetingList,
  MeetingWidget,
  CreateMeetingModal,
  type Meeting,
} from '@/features/meetings';
import { useUnreadCount } from '@/features/notifications';
import { NotificationPanel } from '@/features/notifications/components/NotificationPanel';
import { assistantApi } from '@/features/assistant/api';
import {
  DailyPlanEditor,
  createInitialPlanEdits,
  loadPlanEdits,
  persistPlanEdits,
  useAcceptDailyPlan,
  type DailyPlanPayload,
  type PlanEditsMap,
} from '@/features/planning';
import { useFleetAgentLocations } from '@/features/tracking/api';
import { searchPlaces, type GeocodedPlace } from '@/lib/map/geocoding';
import { PlaceSearchCreditExhaustedError } from '@/lib/map/place-search';
import { getAttributionLine } from '@/lib/map/place-attribution';
import { loadRecentDestinations, type RecentDestination } from '@/lib/map/recentDestinations';
import { toast } from '@/lib/toast';

function getDayAbbr(date: Date): string {
  return format(date, 'EEE');
}

function generateMonthDays(): Date[] {
  const today = startOfDay(new Date());
  return Array.from({ length: 30 }, (_, i) => addDays(today, i));
}

function getTasksForDate(tasks: Task[], date: Date): Task[] {
  return tasks.filter((task) => {
    const raw = task.dueDate ?? task.assignedAt;
    if (!raw) return false;
    try {
      const parsed = parseISO(raw);
      return isValid(parsed) && isSameDay(parsed, date);
    } catch {
      return false;
    }
  });
}

function getMeetingsForDate(meetings: Meeting[], date: Date): Meeting[] {
  return meetings.filter((m) => {
    try {
      const parsed = parseISO(m.startAt);
      return isValid(parsed) && isSameDay(parsed, date);
    } catch {
      return false;
    }
  });
}

function getPriorityColor(priority?: string): string {
  switch (priority) {
    case 'urgent':
      return '#EF4444';
    case 'high':
      return '#F97316';
    case 'medium':
      return '#FBBF24';
    default:
      return '#7BB6B8';
  }
}

function getStatusBadge(status: string): { bg: string; text: string; label: string } {
  switch (status) {
    case 'completed':
      return { bg: 'rgba(16,185,129,0.2)', text: '#10B981', label: 'Completed' };
    case 'in_progress':
    case 'resumed':
      return { bg: 'rgba(123,182,184,0.2)', text: '#7BB6B8', label: 'In Progress' };
    case 'paused':
      return { bg: 'rgba(251,191,36,0.2)', text: '#FBBF24', label: 'Paused' };
    case 'cancelled':
      return { bg: 'rgba(239,68,68,0.2)', text: '#EF4444', label: 'Cancelled' };
    default:
      return { bg: 'rgba(255,255,255,0.1)', text: 'rgba(255,255,255,0.6)', label: 'Pending' };
  }
}

export default function ManagerHomeScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { firstName, avatarSrc, roleLabel } = useManagerIdentity();
  const { canAccessPayroll } = useManagerPermissions();

  // Notification drawer
  const [notifOpen, setNotifOpen] = useState(false);
  const { data: unreadCount = 0 } = useUnreadCount();

  // Profile dropdown
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Add lead modal
  const [addLeadVisible, setAddLeadVisible] = useState(false);

  // Meetings state
  const [createMeetingVisible, setCreateMeetingVisible] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);

  // Executive Brief / Plan modal state
  const [execBriefOpen, setExecBriefOpen] = useState(false);
  const [planTab, setPlanTab] = useState<'pulse' | 'plan'>('pulse');
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planSummaryText, setPlanSummaryText] = useState('');
  const [planPayload, setPlanPayload] = useState<DailyPlanPayload | null>(null);
  const [planEdits, setPlanEdits] = useState<PlanEditsMap>({});
  const [planAccepted, setPlanAccepted] = useState(false);
  const [planDismissed, setPlanDismissed] = useState(false);
  const acceptPlanMutation = useAcceptDailyPlan();

  // Calendar strip
  const monthDays = React.useMemo(() => generateMonthDays(), []);
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));
  const [dayScheduleVisible, setDayScheduleVisible] = useState(false);

  // Data queries
  const { data: overview } = useDashboardOverview('month');
  const { data: workforceSummary } = useWorkforceSummary();
  const { data: attendanceMetrics } = useAttendanceMetrics();
  const { data: tasks = [], refetch: refetchTasks } = useTaskListItems();
  const { data: reassignments = [] } = useTaskReassignmentsInbox('pending');
  const { data: crmOverview, refetch: refetchCrm } = useAgentUploadsOverview();
  const { data: meetingsResult, refetch: refetchMeetings } = useMeetingList({ per_page: 50 });
  const { data: fleetAgents = [] } = useFleetAgentLocations();

  const meetings = React.useMemo(
    () => meetingsResult?.pages.flatMap((p) => p.items) ?? [],
    [meetingsResult],
  );
  const fleetCounts = React.useMemo(
    () => ({
      online: fleetAgents.filter((a) => a.is_online).length,
      en_route: fleetAgents.filter((a) => a.operational_status === 'en_route').length,
      delayed: fleetAgents.filter((a) => a.operational_status === 'delayed').length,
    }),
    [fleetAgents],
  );

  const totalLeads = crmOverview?.total_uploaded_leads ?? overview?.leads?.total ?? 0;
  const convertedCount =
    overview?.leads?.converted ??
    crmOverview?.recent_leads?.filter((l) => l.status === 'converted' || l.status === 'won').length ??
    0;

  const activeTasksCount = React.useMemo(
    () => tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress').length,
    [tasks],
  );
  const pendingReassignmentsCount = React.useMemo(
    () => reassignments.filter((r) => r.status === 'pending').length,
    [reassignments],
  );

  const selectedDayTasks = React.useMemo(
    () => getTasksForDate(tasks, selectedDate),
    [tasks, selectedDate],
  );
  const selectedDayMeetings = React.useMemo(
    () => getMeetingsForDate(meetings, selectedDate),
    [meetings, selectedDate],
  );

  // Pull-up drawer (Find Agent or Location)
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [whereToQuery, setWhereToQuery] = useState('');
  const [whereToResults, setWhereToResults] = useState<GeocodedPlace[]>([]);
  const [whereToSearching, setWhereToSearching] = useState(false);
  const [placeCreditsExhausted, setPlaceCreditsExhausted] = useState(false);
  const [recentPlaces, setRecentPlaces] = useState<RecentDestination[]>([]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matchingAgents = React.useMemo(() => {
    const q = whereToQuery.trim().toLowerCase();
    if (!q) return fleetAgents.slice(0, 5);
    return fleetAgents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.email && a.email.toLowerCase().includes(q)) ||
        (a.active_task?.title && a.active_task.title.toLowerCase().includes(q)),
    );
  }, [fleetAgents, whereToQuery]);

  useEffect(() => {
    setRecentPlaces(loadRecentDestinations());
  }, [sheetExpanded]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const trimmed = whereToQuery.trim();
    if (trimmed.length < 2) {
      setWhereToResults([]);
      setWhereToSearching(false);
      return;
    }
    setWhereToSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(trimmed);
        setPlaceCreditsExhausted(false);
        setWhereToResults(results);
      } catch (err) {
        if (err instanceof PlaceSearchCreditExhaustedError) {
          setPlaceCreditsExhausted(true);
        }
        setWhereToResults([]);
      } finally {
        setWhereToSearching(false);
      }
    }, 350);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [whereToQuery]);

  const handleSelectAgentOnMap = useCallback(
    (agentId: number) => {
      setSheetExpanded(false);
      setWhereToQuery('');
      router.push(`/map?agentId=${agentId}`);
    },
    [router],
  );

  const handleSelectPlace = useCallback(
    (place: { name: string; address?: string; latitude: number; longitude: number }) => {
      setSheetExpanded(false);
      setWhereToQuery('');
      setWhereToResults([]);
      const params = new URLSearchParams({
        destLat: String(place.latitude),
        destLng: String(place.longitude),
        destName: place.name,
        destAddr: place.address ?? '',
      });
      router.push(`/map?${params.toString()}`);
    },
    [router],
  );

  const handleSelectDay = useCallback((day: Date) => {
    setSelectedDate(day);
    setDayScheduleVisible(true);
  }, []);

  const handleGenerateTeamPlan = useCallback(async () => {
    setPlanTab('plan');
    setPlanLoading(true);
    setPlanError(null);
    setPlanPayload(null);
    setPlanAccepted(false);
    setPlanDismissed(false);

    try {
      const response = await assistantApi.sendMessage({
        message: 'Plan operational priorities and tasks for today across my team',
      });
      setPlanSummaryText(response.content);

      const candidate = response.payload as unknown as DailyPlanPayload | null;
      if (candidate && Array.isArray(candidate.items)) {
        const stored = loadPlanEdits(`manager:plan:${candidate.plan_date}`, candidate);
        setPlanPayload(candidate);
        setPlanEdits(stored);
      }
    } catch {
      setPlanError('Could not generate team plan right now. Please try again.');
    } finally {
      setPlanLoading(false);
    }
  }, []);

  const handlePlanEditsChange = useCallback(
    (nextEdits: PlanEditsMap) => {
      setPlanEdits(nextEdits);
      if (planPayload) {
        persistPlanEdits(`manager:plan:${planPayload.plan_date}`, nextEdits);
      }
    },
    [planPayload],
  );

  const handleAcceptPlan = useCallback(async () => {
    if (!planPayload) return;
    try {
      const result = await acceptPlanMutation.mutateAsync({
        payload: planPayload,
        edits: planEdits,
      });
      setPlanAccepted(true);
      toast.success(
        result.created.length > 0
          ? `Created ${result.created.length} task${result.created.length === 1 ? '' : 's'} from your plan`
          : 'Plan saved',
      );
      void refetchTasks();
    } catch {
      toast.error('Could not create tasks from plan. Please try again.');
    }
  }, [acceptPlanMutation, planEdits, planPayload, refetchTasks]);

  return (
    <div className="relative flex flex-col flex-1 min-h-screen bg-[#0A1D25] overflow-x-hidden pb-[120px] font-sans">
      {/* Background gradients */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center pointer-events-none opacity-40 mix-blend-overlay"
        style={{ backgroundImage: "url('/assets/home-background-gradient.png')" }}
      />
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-[#0A1D25]/85 via-[#0D252F]/90 to-[#0A1D25]/97 pointer-events-none" />

      <div className="relative z-10 flex flex-col flex-1 px-5 pt-3">
        {/* ─── Top Bar ─── */}
        <div className="flex items-center justify-between py-2 mb-1 relative z-50">
          <div className="relative">
            <button
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className="flex items-center gap-2.5 text-left focus:outline-none"
            >
              <div className="relative w-11 h-11">
                <img
                  src={avatarSrc}
                  alt="Avatar"
                  className="w-11 h-11 rounded-full bg-white/10 object-cover"
                />
                <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-[#22C55E] border-2 border-[#0A1D25]" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-lg font-bold text-white tracking-tight">
                    Hi, {firstName}
                  </span>
                  <span className="rounded-full bg-[#75ADAF]/20 border border-[#75ADAF]/40 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-[#75ADAF]">
                    {roleLabel}
                  </span>
                </div>
                <span className="text-[10px] text-white/50">
                  {fleetCounts.online || workforceSummary?.online_agents || 0} agents online
                </span>
              </div>
            </button>

            <AnimatePresence>
              {profileMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setProfileMenuOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 mt-2 w-52 bg-[#112A36] border border-white/10 rounded-xl shadow-xl py-1.5 z-50"
                  >
                    <button
                      onClick={() => {
                        setProfileMenuOpen(false);
                        router.push('/profile');
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-white hover:bg-white/5 flex items-center gap-2.5"
                    >
                      <img src="/assets/user-round.png" alt="Profile" className="w-4 h-4 object-contain" />
                      Profile &amp; Settings
                    </button>
                    <div className="h-px bg-white/10 mx-2.5" />
                    <button
                      onClick={() => {
                        setProfileMenuOpen(false);
                        router.push('/workforce');
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-white hover:bg-white/5 flex items-center gap-2.5"
                    >
                      <Users size={15} className="text-[#75ADAF]" />
                      Team &amp; Attendance
                    </button>
                    <div className="h-px bg-white/10 mx-2.5" />
                    <button
                      onClick={() => {
                        setProfileMenuOpen(false);
                        router.push('/field-activity');
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-white hover:bg-white/5 flex items-center gap-2.5"
                    >
                      <Activity size={15} className="text-[#75ADAF]" />
                      Team Journeys
                    </button>
                    {canAccessPayroll && (
                      <>
                        <div className="h-px bg-white/10 mx-2.5" />
                        <button
                          onClick={() => {
                            setProfileMenuOpen(false);
                            router.push('/payroll');
                          }}
                          className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-white hover:bg-white/5 flex items-center gap-2.5"
                        >
                          <DollarSign size={15} className="text-[#75ADAF]" />
                          Payroll Approval
                        </button>
                      </>
                    )}
                    <div className="h-px bg-white/10 mx-2.5" />
                    <button
                      onClick={() => {
                        setProfileMenuOpen(false);
                        router.push('/sync/queue');
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-white hover:bg-white/5 flex items-center gap-2.5"
                    >
                      <Clock size={15} className="text-[#75ADAF]" />
                      Sync Queue
                    </button>
                    <div className="h-px bg-white/10 mx-2.5" />
                    <button
                      onClick={() => {
                        setProfileMenuOpen(false);
                        signOut();
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-[#EF4444] hover:bg-white/5 flex items-center gap-2.5"
                    >
                      <img src="/assets/log-out.png" alt="Sign Out" className="w-4 h-4 object-contain" />
                      Sign Out
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={() => setNotifOpen(true)}
            className="relative w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors focus:outline-none"
          >
            <Bell size={20} className="text-white" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] rounded-full bg-[#FF6B5B] px-1 flex items-center justify-center text-[10px] font-bold text-white border-1.5 border-[#0A1D25]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* ─── Calendar Strip (30 days) ─── */}
        <div className="flex overflow-x-auto py-3.5 mb-2 gap-1.5 scrollbar-none -mx-5 px-5">
          {monthDays.map((day, idx) => {
            const isSelected = isSameDay(day, selectedDate);
            const dayTasks = getTasksForDate(tasks, day);
            const dayMeetings = getMeetingsForDate(meetings, day);
            const hasEvents = dayTasks.length > 0 || dayMeetings.length > 0;
            return (
              <button
                key={idx}
                onClick={() => handleSelectDay(day)}
                className="flex flex-col items-center min-w-[44px] py-1.5 px-1 rounded-xl select-none focus:outline-none group"
              >
                <span
                  className={`text-[11px] font-medium mb-1.5 ${
                    isSelected ? 'text-white font-semibold' : 'text-white/45 group-hover:text-white/70'
                  }`}
                >
                  {getDayAbbr(day)}
                </span>
                <div
                  className={`w-[34px] h-[34px] rounded-full flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-[#7BB6B8]' : 'group-hover:bg-white/5'
                  }`}
                >
                  <span
                    className={`text-sm font-semibold ${
                      isSelected ? 'text-[#0A1D25] font-bold' : 'text-white/70'
                    }`}
                  >
                    {format(day, 'd')}
                  </span>
                </div>
                {hasEvents && (
                  <div className="flex gap-1 mt-1">
                    {dayTasks.length > 0 && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isSelected ? 'bg-[#0A1D25]' : 'bg-[#7BB6B8]'
                        }`}
                      />
                    )}
                    {dayMeetings.length > 0 && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isSelected ? 'bg-[#FD6046]' : 'bg-[#FD6046]'
                        }`}
                      />
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* ─── Action Row: Operations | Exec Brief | Add Lead ─── */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => router.push('/tasks')}
            className="h-9 px-3.5 rounded-[12px] bg-[#0B3343] hover:bg-[#0E3F52] flex items-center justify-center gap-1.5 active:scale-95 transition-all outline-none"
          >
            <span className="font-sans font-bold text-xs text-[#D0E2E3]">Operations</span>
            {activeTasksCount + pendingReassignmentsCount > 0 && (
              <span className="min-w-[18px] h-[18px] rounded-full bg-[#FF6B5B] px-1 flex items-center justify-center text-[10px] font-bold text-white">
                {activeTasksCount + pendingReassignmentsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setExecBriefOpen(true)}
            className="h-9 px-3 rounded-[12px] bg-[#75ADAF]/20 hover:bg-[#75ADAF]/30 border border-[#75ADAF]/40 flex items-center justify-center gap-1.5 text-[#D0E2E3] active:scale-95 transition-all outline-none"
          >
            <Sparkles size={13} className="text-[#75ADAF]" />
            <span className="font-sans font-bold text-xs text-white whitespace-nowrap">
              Exec Brief
            </span>
          </button>

          <div className="flex-1" />

          <button
            onClick={() => setAddLeadVisible(true)}
            className="h-9 px-3 rounded-[11px] bg-[#FD6046] hover:bg-[#E0533C] flex items-center justify-center gap-1 text-white shadow-sm active:scale-95 transition-all outline-none"
          >
            <Plus size={14} className="stroke-[2.5]" />
            <span className="font-sans font-medium text-[11px] whitespace-nowrap">Add Lead</span>
          </button>
        </div>

        {/* ─── Pending Reassignment Alert Banner ─── */}
        {pendingReassignmentsCount > 0 && (
          <button
            type="button"
            onClick={() => router.push('/tasks?tab=reassignments')}
            className="mb-3 flex w-full items-center justify-between rounded-2xl border border-[#FD6046]/40 bg-[#FD6046]/12 px-4 py-3 text-left active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FD6046]/20 text-[#FD6046]">
                <ArrowRightLeft size={15} />
              </div>
              <div>
                <p className="text-xs font-bold text-white">
                  {pendingReassignmentsCount} Pending Task Reassignment
                  {pendingReassignmentsCount === 1 ? '' : 's'}
                </p>
                <p className="text-[10px] text-white/65">
                  Agents requested task reassignment — tap to review &amp; approve
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="text-[#FD6046]" />
          </button>
        )}

        {/* ─── Dual Hero Cards Row: Team Leads Card + Workforce Attendance Card ─── */}
        <div className="flex gap-2.5 mb-2.5">
          <div
            onClick={() => router.push('/crm')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') router.push('/crm');
            }}
            className="flex-1 h-[147px] rounded-[20px] bg-cover bg-center overflow-hidden shadow-lg border border-white/5 relative flex flex-col justify-between py-[18px] px-4 select-none cursor-pointer active:scale-[0.99] transition-transform"
            style={{ backgroundImage: "url('/assets/lead-added-card-gradient.png')" }}
          >
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-sans text-[11px] font-normal text-white leading-tight">
                  Team Leads
                </span>
                <span className="font-sans text-[11px] font-normal text-white leading-tight">
                  Uploaded
                </span>
              </div>

              <span className="font-sans text-[28px] font-extrabold text-white tracking-tight">
                {totalLeads}
              </span>

              <div className="flex items-center gap-1.5">
                <img
                  src="/assets/conversion-badge.png"
                  alt="Conversion"
                  className="w-7 h-7 object-contain"
                />
                <div className="flex flex-col">
                  <span className="font-sans text-[10px] font-semibold text-[#75ADAF]">
                    Conversion
                  </span>
                  <span className="font-sans text-xs font-bold text-white">{convertedCount}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              {crmOverview?.top_agent ? (
                <div className="flex flex-col min-w-0">
                  <span className="text-[9px] text-white/55 uppercase tracking-wider">
                    Top Uploader
                  </span>
                  <span className="text-xs font-bold text-white truncate">
                    {crmOverview.top_agent.name} ({crmOverview.top_agent.total_uploads})
                  </span>
                </div>
              ) : (
                <span className="text-[10px] text-white/60">Tap to view CRM pipeline</span>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAddLeadVisible(true);
                }}
                className="w-[100px] h-[34px] rounded-[11px] bg-[#FD6046] hover:bg-[#E0533C] flex items-center justify-center gap-1.5 text-white active:scale-95 transition-all outline-none shrink-0"
              >
                <Plus size={14} className="stroke-[2.5]" />
                <span className="font-sans font-medium text-[10px]">Add Lead</span>
              </button>
            </div>
          </div>

          <AttendanceCard />
        </div>

        {/* ─── Team Field Activity Card ─── */}
        <div className="-mx-5">
          <FieldActivitySummaryCard />
        </div>

        {/* ─── Meetings Calendar Widget ─── */}
        <div className="mt-2.5 mb-2">
          <MeetingWidget
            onCreateMeeting={() => {
              setEditingMeeting(null);
              setCreateMeetingVisible(true);
            }}
          />
        </div>
      </div>

      {/* ─── Bottom Pull-up Sheet ("Find Agent or Location") ─── */}
      <div
        className={`fixed left-0 right-0 z-40 bg-[#0B2330]/95 backdrop-blur-xl rounded-t-3xl border-t border-white/10 px-5 pt-2.5 transition-all duration-300 shadow-[0_-8px_30px_rgb(0,0,0,0.4)] ${
          sheetExpanded ? 'bottom-0 top-14 pb-8 overflow-y-auto z-[60]' : 'bottom-[82px] pb-3.5'
        }`}
      >
        <div
          onClick={() => setSheetExpanded(!sheetExpanded)}
          className="w-full py-1.5 flex justify-center cursor-pointer"
        >
          <div className="w-9 h-1 rounded-full bg-white/25" />
        </div>

        <div className="flex items-center h-11 rounded-[14px] bg-white/10 border border-white/10 px-3.5 gap-2.5 mt-1">
          <Search size={18} className="text-white/45 flex-shrink-0" />
          <input
            type="text"
            placeholder="Find live agent or location on map..."
            value={whereToQuery}
            onFocus={() => setSheetExpanded(true)}
            onChange={(e) => {
              setWhereToQuery(e.target.value);
              if (!sheetExpanded) setSheetExpanded(true);
            }}
            className="flex-1 bg-transparent text-sm font-medium text-white placeholder-white/45 outline-none"
          />
          {whereToQuery.length > 0 && (
            <button
              onClick={() => {
                setWhereToQuery('');
                setWhereToResults([]);
              }}
              className="text-xs text-white/40 hover:text-white px-1"
            >
              ✕
            </button>
          )}
          {sheetExpanded && (
            <button
              onClick={() => {
                setSheetExpanded(false);
                setWhereToQuery('');
                setWhereToResults([]);
              }}
              className="text-xs font-semibold text-[#75ADAF] pl-2 border-l border-white/10"
            >
              Done
            </button>
          )}
        </div>

        {sheetExpanded && (
          <div className="mt-4 flex flex-col gap-3">
            {/* Live Agents section */}
            {matchingAgents.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#75ADAF] mb-2">
                  Field Agents ({matchingAgents.length})
                </p>
                <div className="space-y-1.5">
                  {matchingAgents.map((agent) => (
                    <button
                      key={agent.user_id}
                      type="button"
                      onClick={() => handleSelectAgentOnMap(agent.user_id)}
                      className="flex items-center gap-3 w-full rounded-xl bg-white/5 hover:bg-white/10 px-3 py-2.5 text-left transition-colors"
                    >
                      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#75ADAF]/20 text-xs font-bold text-[#75ADAF]">
                        {agent.name.slice(0, 2).toUpperCase()}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[#0B2330] ${
                            agent.is_online ? 'bg-[#22C55E]' : 'bg-white/30'
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{agent.name}</p>
                        <p className="text-xs text-white/50 truncate">
                          {agent.active_task
                            ? `Task: ${agent.active_task.title}`
                            : agent.operational_status.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <Navigation size={15} className="text-[#75ADAF] shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Place Search Results */}
            {whereToSearching && (
              <div className="flex items-center gap-2 py-3 justify-center">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#75ADAF] border-t-transparent" />
                <span className="text-xs text-white/50">Searching locations…</span>
              </div>
            )}

            {!whereToSearching && whereToResults.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1.5">
                  Map Locations
                </p>
                {whereToResults.map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => handleSelectPlace(place)}
                    className="flex items-center gap-3 py-2.5 border-b border-white/5 text-left hover:bg-white/5 rounded-lg px-2 transition-colors w-full"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#75ADAF]/15 flex items-center justify-center flex-shrink-0">
                      <MapPin size={15} className="text-[#75ADAF]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{place.name}</p>
                      <p className="text-xs text-white/50 truncate">{place.address}</p>
                    </div>
                    <Navigation size={14} className="text-white/30 flex-shrink-0" />
                  </button>
                ))}
                {getAttributionLine(whereToResults) && (
                  <p className="text-[10px] text-white/35 text-right pt-2 pr-2">
                    {getAttributionLine(whereToResults)}
                  </p>
                )}
              </div>
            )}

            {placeCreditsExhausted && (
              <p className="text-xs text-amber-300/80 text-center py-3 px-3">
                Location search is temporarily unavailable. You can still browse agents and saved locations on the map.
              </p>
            )}

            {whereToQuery.trim().length < 2 && recentPlaces.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1">
                  Recent Map Destinations
                </p>
                {recentPlaces.map((place, idx) => (
                  <button
                    key={`${place.latitude}-${place.longitude}-${idx}`}
                    type="button"
                    onClick={() => handleSelectPlace(place)}
                    className="flex items-center gap-3 py-2.5 border-b border-white/5 text-left hover:bg-white/5 rounded-lg px-2 transition-colors w-full"
                  >
                    <div className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
                      <Clock size={14} className="text-white/50" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{place.name}</p>
                      <p className="text-xs text-white/50 truncate">{place.address}</p>
                    </div>
                    <Navigation size={14} className="text-white/30 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Manager Executive Brief & Team Planner Modal ─── */}
      <AnimatePresence>
        {execBriefOpen && (
          <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setExecBriefOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
              className="relative w-full max-w-md max-h-[88vh] bg-[#0F2B36] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 overflow-y-auto z-10 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-[#75ADAF]" />
                  <h3 className="text-base font-bold text-white">Manager Executive Brief</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setExecBriefOpen(false)}
                  className="text-xs font-semibold text-white/50 hover:text-white px-2 py-1"
                >
                  Close
                </button>
              </div>

              {/* Sub-tabs: Live Pulse | AI Team Planner */}
              <div className="flex gap-2 mb-4 rounded-xl bg-black/25 p-1">
                <button
                  type="button"
                  onClick={() => setPlanTab('pulse')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
                    planTab === 'pulse' ? 'bg-[#75ADAF] text-[#0A1D25]' : 'text-white/60'
                  }`}
                >
                  Operations Pulse
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlanTab('plan');
                    if (!planPayload && !planLoading) {
                      void handleGenerateTeamPlan();
                    }
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
                    planTab === 'plan' ? 'bg-[#75ADAF] text-[#0A1D25]' : 'text-white/60'
                  }`}
                >
                  AI Team Planner
                </button>
              </div>

              {planTab === 'pulse' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
                      <p className="text-[10px] uppercase tracking-wider text-white/50">
                        Workforce Attendance
                      </p>
                      <p className="mt-1 text-xl font-extrabold text-white">
                        {(attendanceMetrics?.present ?? 0) + (attendanceMetrics?.late ?? 0)} /{' '}
                        {attendanceMetrics?.total_workforce ?? workforceSummary?.total_agents ?? 0}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#75ADAF]">
                        {attendanceMetrics?.attendance_percentage ?? 0}% Present •{' '}
                        {attendanceMetrics?.late ?? 0} Late
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
                      <p className="text-[10px] uppercase tracking-wider text-white/50">
                        Active Tasks
                      </p>
                      <p className="mt-1 text-xl font-extrabold text-white">{activeTasksCount}</p>
                      <p className="mt-0.5 text-[11px] text-[#FD6046]">
                        {pendingReassignmentsCount} Reassignment req.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
                      <p className="text-[10px] uppercase tracking-wider text-white/50">
                        Live Fleet Status
                      </p>
                      <p className="mt-1 text-xl font-extrabold text-[#22C55E]">
                        {fleetCounts.online} Online
                      </p>
                      <p className="mt-0.5 text-[11px] text-white/60">
                        {fleetCounts.en_route} En Route •{' '}
                        {fleetCounts.delayed} Delayed
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
                      <p className="text-[10px] uppercase tracking-wider text-white/50">
                        CRM Pipeline
                      </p>
                      <p className="mt-1 text-xl font-extrabold text-white">{totalLeads}</p>
                      <p className="mt-0.5 text-[11px] text-[#75ADAF]">
                        {convertedCount} Converted
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setExecBriefOpen(false);
                        router.push('/assistant?prompt=Generate+this+week%27s+executive+summary');
                      }}
                      className="w-full h-11 rounded-2xl bg-[#75ADAF] text-[#0A1D25] text-xs font-extrabold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                    >
                      <Sparkles size={14} />
                      Generate Weekly Executive Report with ELY
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExecBriefOpen(false);
                        router.push('/tasks?create=1');
                      }}
                      className="w-full h-11 rounded-2xl bg-[#FD6046] text-white text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                    >
                      <Briefcase size={14} />
                      Create &amp; Assign New Task
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {planLoading && (
                    <div className="py-12 flex flex-col items-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#75ADAF] border-t-transparent" />
                      <p className="text-xs text-white/60">
                        Analyzing team tasks, KPIs, meetings &amp; leads…
                      </p>
                    </div>
                  )}

                  {planError && !planLoading && (
                    <div className="py-6 text-center">
                      <p className="text-xs text-[#EF4444] mb-4">{planError}</p>
                      <button
                        type="button"
                        onClick={() => void handleGenerateTeamPlan()}
                        className="h-9 px-4 rounded-full bg-[#75ADAF] text-[#091519] text-xs font-bold"
                      >
                        Try again
                      </button>
                    </div>
                  )}

                  {!planLoading && !planError && planSummaryText && (
                    <p className="text-xs text-white/80 leading-relaxed whitespace-pre-wrap mb-2">
                      {planSummaryText}
                    </p>
                  )}

                  {!planLoading && planPayload && (
                    <DailyPlanEditor
                      payload={planPayload}
                      edits={planEdits}
                      onEditsChange={handlePlanEditsChange}
                      onAccept={() => void handleAcceptPlan()}
                      onDismiss={() => {
                        setPlanDismissed(true);
                        setExecBriefOpen(false);
                      }}
                      isAccepting={acceptPlanMutation.isPending}
                      accepted={planAccepted}
                      dismissed={planDismissed}
                    />
                  )}
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Modals ─── */}
      <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} />

      <AddLeadModal
        visible={addLeadVisible}
        onClose={() => setAddLeadVisible(false)}
        onSuccess={() => refetchCrm()}
      />

      <CreateMeetingModal
        open={createMeetingVisible}
        onClose={() => {
          setCreateMeetingVisible(false);
          setEditingMeeting(null);
        }}
        onCreated={() => refetchMeetings()}
      />

      {/* ─── Day Schedule Modal (Team Tasks + Meetings for selected date) ─── */}
      <AnimatePresence>
        {dayScheduleVisible && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55">
            <div className="absolute inset-0" onClick={() => setDayScheduleVisible(false)} />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="relative z-10 w-full max-w-md bg-[#0D252F] rounded-t-3xl pt-2.5 px-5 pb-9 max-h-[80vh] flex flex-col border-t border-white/10"
            >
              <div className="w-9 h-1 rounded-full bg-white/25 self-center mb-3.5 shrink-0" />
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {format(selectedDate, 'EEEE, MMM d')}
                  </h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    {selectedDayTasks.length} team task{selectedDayTasks.length !== 1 ? 's' : ''} •{' '}
                    {selectedDayMeetings.length} meeting{selectedDayMeetings.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setDayScheduleVisible(false);
                      router.push('/tasks?create=1');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#FD6046]/20 border border-[#FD6046]/40 text-xs text-[#FD6046] font-semibold"
                  >
                    + Task
                  </button>
                  <button
                    onClick={() => setDayScheduleVisible(false)}
                    className="px-3 py-1.5 rounded-lg bg-white/10 text-xs text-white/70 font-semibold hover:bg-white/15"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 space-y-5 pr-1">
                <div>
                  <h4 className="text-xs font-bold text-[#7BB6B8] uppercase tracking-wider mb-2.5">
                    Team Tasks ({selectedDayTasks.length})
                  </h4>
                  {selectedDayTasks.length === 0 ? (
                    <div className="bg-white/5 rounded-xl p-4 text-center">
                      <p className="text-xs text-white/40">No tasks scheduled for this date</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedDayTasks.map((task) => {
                        const badge = getStatusBadge(task.status);
                        return (
                          <div
                            key={task.id}
                            onClick={() => {
                              setDayScheduleVisible(false);
                              router.push(`/task/${task.id}`);
                            }}
                            className="flex items-center bg-white/5 hover:bg-white/10 rounded-xl p-3 cursor-pointer transition-colors"
                          >
                            <div
                              className="w-1 h-9 rounded-sm mr-3 shrink-0"
                              style={{ backgroundColor: getPriorityColor(task.priority) }}
                            />
                            <div className="flex-1 mr-2 min-w-0">
                              <p className="text-sm font-semibold text-white truncate">
                                {task.title}
                              </p>
                              <p className="text-xs text-white/45 truncate mt-0.5">
                                {task.assigneeName ? `${task.assigneeName} • ` : ''}
                                {task.address}
                              </p>
                            </div>
                            <span
                              className="px-2 py-1 rounded-md text-[10px] font-bold shrink-0"
                              style={{ backgroundColor: badge.bg, color: badge.text }}
                            >
                              {badge.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-bold text-[#FD6046] uppercase tracking-wider mb-2.5">
                    Meetings ({selectedDayMeetings.length})
                  </h4>
                  {selectedDayMeetings.length === 0 ? (
                    <div className="bg-white/5 rounded-xl p-4 text-center">
                      <p className="text-xs text-white/40">No meetings scheduled for this date</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedDayMeetings.map((m) => {
                        let timeLabel = '';
                        try {
                          const s = parseISO(m.startAt);
                          const e = parseISO(m.endAt);
                          if (isValid(s) && isValid(e)) {
                            timeLabel = `${format(s, 'h:mm a')} – ${format(e, 'h:mm a')}`;
                          }
                        } catch {
                          // ignore
                        }
                        return (
                          <div
                            key={m.id}
                            onClick={() => {
                              setDayScheduleVisible(false);
                              router.push(`/meetings/${m.id}`);
                            }}
                            className="flex items-center bg-white/5 hover:bg-white/10 rounded-xl p-3 cursor-pointer transition-colors"
                          >
                            <div className="w-1 h-9 rounded-sm bg-[#FD6046] mr-3 shrink-0" />
                            <div className="flex-1 mr-2 min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{m.title}</p>
                              {timeLabel && (
                                <p className="text-xs text-[#7BB6B8] mt-0.5">{timeLabel}</p>
                              )}
                            </div>
                            <span className="text-lg text-white/35 font-semibold">›</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
