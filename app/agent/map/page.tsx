'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, ClipboardList, Eye, EyeOff, Radio, X } from 'lucide-react';
import { AgentMapView } from '@/components/map/agent-map-view';
import { BusinessListPanel } from '@/components/map/BusinessListPanel';
import { LocationSearchInput } from '@/components/map/LocationSearchInput';
import { useActiveTracking } from '@/components/tracking/active-tracking-provider';
import { useTrackingStore } from '@/store/tracking';
import { useAuthStore } from '@/store/auth';
import { getActiveCompanyContext } from '@/lib/company-context';
import { getAuthTokenFromDocument } from '@/lib/auth/session';
import { listAgentTasks, getTaskRoute, listAgentLocations } from '@/lib/api/tracking';
import { useSavedLocations } from '@/hooks/use-saved-locations';
import type { AgentLocationSnapshotItem } from '@/types/tracking';
import type { SavedLocation } from '@/lib/api/saved-locations';
import { isInsideLocationContext, type LocationContext } from '@/lib/map/location-search';

export default function AgentMapPage() {
  const router = useRouter();
  const { isTracking, activeTaskId } = useActiveTracking();
  const liveTasks = useTrackingStore((s) => s.liveTasks);
  const setActiveTrackingTask = useTrackingStore((s) => s.setActiveTrackingTask);
  const hydrateFromRoute = useTrackingStore((s) => s.hydrateFromRoute);
  const hydrateFromSnapshots = useTrackingStore((s) => s.hydrateFromSnapshots);
  const activeTask = activeTaskId ? liveTasks[activeTaskId] : null;

  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);

  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [locationCtx, setLocationCtx] = useState<LocationContext | null>(null);
  const [focusLocation, setFocusLocation] = useState<SavedLocation | null>(null);
  const [showPinnedBusinesses, setShowPinnedBusinesses] = useState(true);

  const { data: savedLocations = [], isLoading: savedLocationsLoading } = useSavedLocations();

  const filteredLocations = useMemo(() => {
    if (!locationCtx) return savedLocations;
    return savedLocations.filter((location) => isInsideLocationContext(location, locationCtx));
  }, [savedLocations, locationCtx]);

  const handleViewActiveTracking = useCallback(async () => {
    if (!companyId || !user?.id) return;

    setResuming(true);
    setResumeError(null);

    try {
      const token = getAuthTokenFromDocument();

      const tasksRes = await listAgentTasks(
        { company_id: companyId, status: 'in_progress' },
        token
      );
      const inProgressTasks = tasksRes.data.items;

      if (!inProgressTasks.length) {
        setResumeError('No active tasks in progress. Start a task to track it.');
        return;
      }

      const task = inProgressTasks[0];
      const taskId = Number(task.id);

      const [routeRes, snapshotRes] = await Promise.allSettled([
        getTaskRoute(taskId, { company_id: companyId, role: 'agent', include_points: true }, token),
        listAgentLocations(
          { company_id: companyId, user_id: user.id, task_id: taskId, include_offline: true },
          token
        ),
      ]);

      if (routeRes.status === 'fulfilled') {
        hydrateFromRoute(taskId, routeRes.value.data, task);
      }

      if (snapshotRes.status === 'fulfilled' && snapshotRes.value.data.items.length) {
        hydrateFromSnapshots(
          snapshotRes.value.data.items as unknown as AgentLocationSnapshotItem[]
        );
      }

      setActiveTrackingTask(taskId);
      setViewMode(true);
      setSheetOpen(false);
    } catch {
      setResumeError('Failed to load tracking data. Please try again.');
    } finally {
      setResuming(false);
    }
  }, [companyId, user, hydrateFromRoute, hydrateFromSnapshots, setActiveTrackingTask]);

  const handleExitView = useCallback(() => {
    setActiveTrackingTask(null);
    setViewMode(false);
    setResumeError(null);
    setSheetOpen(true);
  }, [setActiveTrackingTask]);

  const handleSavedLocationClick = useCallback((location: SavedLocation) => {
    setFocusLocation(location);
    setSheetOpen(false);
  }, []);

  return (
    <div className="relative">
      <AgentMapView
        showSavedLocations={showPinnedBusinesses}
        focusLocation={focusLocation}
        pinToolbarClassName={
          sheetOpen
            ? 'bottom-[45vh] right-4 md:right-10 z-30'
            : 'bottom-28 right-4 md:right-10 z-30'
        }
        mapControlsClassName={
          sheetOpen
            ? 'absolute bottom-[calc(42vh+1rem)] left-1/2 -translate-x-1/2 z-30 flex items-center gap-2'
            : 'absolute bottom-24 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2'
        }
      />

      {activeTask && isTracking && (
        <div className="absolute top-3 left-3 right-3 z-10 bg-white/90 backdrop-blur-sm rounded-2xl shadow px-4 py-2.5 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                viewMode ? 'bg-blue-400' : 'bg-red-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                viewMode ? 'bg-blue-500' : 'bg-red-500'
              }`}
            />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-dash-dark truncate">{activeTask.taskTitle}</p>
            <p className="text-[10px] text-gray-400">
              {viewMode ? 'Live tracking view' : 'Tracking your location'}
            </p>
          </div>
          {viewMode ? (
            <button
              onClick={handleExitView}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors shrink-0"
              title="Exit view"
            >
              <X size={14} className="text-gray-500" />
            </button>
          ) : (
            <button
              onClick={() => router.push(`/agent/tasks/${activeTaskId}/tracking`)}
              className="text-[11px] text-dash-teal font-bold shrink-0"
            >
              Details
            </button>
          )}
        </div>
      )}

      {!isTracking && (
        <div className="absolute top-3 left-3 right-3 z-10 flex flex-col gap-2 pointer-events-none">
          <div className="pointer-events-auto">
            <LocationSearchInput
              activeLocation={locationCtx}
              onLocationSelect={setLocationCtx}
              className="w-full max-w-md"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
            <button
              onClick={() => router.push('/agent/tasks')}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/95 backdrop-blur rounded-full text-[12px] font-bold text-dash-dark shadow-lg border border-slate-100 hover:bg-white transition-all"
            >
              <ClipboardList size={14} className="text-[#7EB5AE]" />
              My Tasks
            </button>
            <button
              onClick={handleViewActiveTracking}
              disabled={resuming || !companyId}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#7EB5AE] text-white rounded-full text-[12px] font-bold shadow-lg hover:opacity-90 transition-all disabled:opacity-50"
            >
              {resuming ? (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Radio size={14} />
              )}
              {resuming ? 'Loading…' : 'Active Tracking'}
            </button>
            <button
              onClick={() => setShowPinnedBusinesses((visible) => !visible)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/95 backdrop-blur rounded-full text-[12px] font-bold text-dash-dark shadow-lg border border-slate-100 hover:bg-white transition-all"
            >
              {showPinnedBusinesses ? <EyeOff size={14} className="text-[#7EB5AE]" /> : <Eye size={14} className="text-[#7EB5AE]" />}
              {showPinnedBusinesses ? 'Hide Pins' : 'Show Pins'}
            </button>
          </div>
          {resumeError && (
            <p className="text-[11px] text-red-500 bg-white/95 backdrop-blur rounded-xl px-3 py-2 shadow pointer-events-auto max-w-md">
              {resumeError}
            </p>
          )}
        </div>
      )}

      <div
        className={`absolute left-3 right-3 z-20 bg-white rounded-[28px] shadow-2xl shadow-black/10 overflow-hidden flex flex-col transition-all duration-300 ${
          sheetOpen ? 'bottom-4 h-[42vh]' : 'bottom-4 h-12'
        }`}
      >
        <button
          type="button"
          onClick={() => setSheetOpen((open) => !open)}
          className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0"
        >
          <span className="text-[13px] font-bold text-dash-dark">
            Pinned Locations ({filteredLocations.length})
          </span>
          {sheetOpen ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronUp size={16} className="text-gray-400" />}
        </button>
        {sheetOpen && (
          <div className="min-h-0 flex-1 overflow-hidden">
            <BusinessListPanel
              activeLocation={locationCtx}
              pois={[]}
              poiBusy={false}
              savedLocations={filteredLocations}
              savedLocationsLoading={savedLocationsLoading}
              onPoiClick={() => {}}
              onSavedClick={handleSavedLocationClick}
            />
          </div>
        )}
      </div>
    </div>
  );
}
