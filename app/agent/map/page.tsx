'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronUp, ClipboardList, Radio, X } from 'lucide-react';
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
import type { PoiResult } from '@/lib/map/overpass-search';
import { parseTaskMapParams } from '@/lib/tasks/map-navigation';

function AgentMapPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isTracking, activeTaskId, startTracking, stopTracking } = useActiveTracking();
  const liveTasks = useTrackingStore((s) => s.liveTasks);
  const hydrateFromRoute = useTrackingStore((s) => s.hydrateFromRoute);
  const hydrateFromSnapshots = useTrackingStore((s) => s.hydrateFromSnapshots);
  const activeTask = activeTaskId ? liveTasks[activeTaskId] : null;

  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);

  const taskFocus = useMemo(
    () => parseTaskMapParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [locationCtx, setLocationCtx] = useState<LocationContext | null>(null);
  const [focusLocation, setFocusLocation] = useState<SavedLocation | null>(null);
  const [viewportPois, setViewportPois] = useState<PoiResult[]>([]);
  const [poiBusy, setPoiBusy] = useState(false);
  const [poiZoomTooLow, setPoiZoomTooLow] = useState(false);
  const [focusPoiId, setFocusPoiId] = useState<string | null>(null);
  const [showPinnedBusinesses, setShowPinnedBusinesses] = useState(true);

  const { data: savedLocations = [], isLoading: savedLocationsLoading } = useSavedLocations();

  const filteredLocations = useMemo(() => {
    if (!locationCtx) return savedLocations;
    return savedLocations.filter((location) => isInsideLocationContext(location, locationCtx));
  }, [savedLocations, locationCtx]);

  const displayedPois = useMemo(() => {
    if (!locationCtx) return viewportPois;
    return viewportPois.filter((poi) =>
      isInsideLocationContext({ latitude: poi.lat, longitude: poi.lng }, locationCtx),
    );
  }, [viewportPois, locationCtx]);

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

      const preferredTaskId = activeTaskId ?? taskFocus?.taskId ?? null;
      const task =
        (preferredTaskId
          ? inProgressTasks.find((item) => Number(item.id) === preferredTaskId)
          : undefined) ?? inProgressTasks[0];
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

      // Error/stop feedback surfaces via the tracking provider's default toasts.
      startTracking(taskId, companyId, token);
      setViewMode(true);
      setSheetOpen(false);
    } catch {
      setResumeError('Failed to load tracking data. Please try again.');
    } finally {
      setResuming(false);
    }
  }, [
    companyId,
    user,
    activeTaskId,
    taskFocus,
    hydrateFromRoute,
    hydrateFromSnapshots,
    startTracking,
  ]);

  const handleExitView = useCallback(() => {
    stopTracking();
    setViewMode(false);
    setResumeError(null);
    setSheetOpen(true);
  }, [stopTracking]);

  const handleLocationSelect = useCallback((ctx: LocationContext | null) => {
    setLocationCtx(ctx);
    setFocusPoiId(ctx?.placeId ?? null);
  }, []);

  const handleSavedLocationClick = useCallback((location: SavedLocation) => {
    setFocusLocation(location);
    setSheetOpen(false);
  }, []);

  const handlePoiClick = useCallback((poi: PoiResult) => {
    setFocusPoiId(poi.id);
    setFocusLocation({
      id: -1,
      name: poi.name,
      type: poi.category,
      description: poi.categoryLabel,
      address: poi.address ?? null,
      latitude: poi.lat,
      longitude: poi.lng,
      contact_number: poi.phone ?? null,
      email: null,
      is_active: true,
      meta: null,
    });
    setSheetOpen(false);
  }, []);

  return (
    <div className="relative">
      <AgentMapView
        showSavedLocations={showPinnedBusinesses}
        focusLocation={focusLocation}
        taskFocus={taskFocus}
        showPinsToggle
        onTogglePins={() => setShowPinnedBusinesses((visible) => !visible)}
        pinsToggleLabel={showPinnedBusinesses ? 'Hide Pins' : 'Show Pins'}
        focusPoiId={focusPoiId}
        searchFocus={locationCtx}
        onPoisChange={setViewportPois}
        onPoiBusyChange={setPoiBusy}
        onPoiZoomTooLowChange={setPoiZoomTooLow}
        onGooglePoiSelect={(poi) => setFocusPoiId(poi?.id ?? null)}
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
              title="Stop tracking and exit view"
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
        <div className="absolute top-20 left-4 right-4 md:top-8 md:left-8 md:right-8 z-20 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col items-start gap-2">
              <button
                onClick={() => router.push('/agent/tasks')}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#0A192F] text-white rounded-full text-[12px] font-bold shadow-lg hover:opacity-90 transition-all"
              >
                <ClipboardList size={14} className="text-white/80" />
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
            </div>

            <div className="ml-auto w-full max-w-md flex justify-end">
              <LocationSearchInput
                activeLocation={locationCtx}
                onLocationSelect={handleLocationSelect}
                className="w-full bg-transparent shadow-none border-0 p-0"
              />
            </div>
          </div>

          <div className="w-full max-w-[300px]">
            <div className="bg-white rounded-[28px] shadow-2xl shadow-black/10 overflow-hidden flex flex-col">
              <button
                type="button"
                onClick={() => setSheetOpen((open) => !open)}
                className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0"
              >
                <span className="text-[13px] font-bold text-dash-dark">
                  {locationCtx || displayedPois.length > 0
                    ? `Businesses (${displayedPois.length})`
                    : `Pinned Locations (${filteredLocations.length})`}
                </span>
                {sheetOpen ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronUp size={16} className="text-gray-400" />}
              </button>
              {sheetOpen && (
                <div className="min-h-0 max-h-[42vh] overflow-y-auto overscroll-contain">
                  <BusinessListPanel
                    activeLocation={locationCtx}
                    pois={displayedPois}
                    poiBusy={poiBusy}
                    poiZoomTooLow={poiZoomTooLow}
                    savedLocations={filteredLocations}
                    savedLocationsLoading={savedLocationsLoading}
                    onPoiClick={handlePoiClick}
                    onSavedClick={handleSavedLocationClick}
                  />
                </div>
              )}
            </div>
          </div>

          {resumeError && (
            <p className="text-[11px] text-red-500 bg-white/95 backdrop-blur rounded-xl px-4 py-2 shadow max-w-[300px]">
              {resumeError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentMapPage() {
  return (
    <Suspense fallback={<div className="relative" style={{ height: 'calc(100vh - 64px)' }} />}>
      <AgentMapPageContent />
    </Suspense>
  );
}
