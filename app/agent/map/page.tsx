'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, Radio, Search, X } from 'lucide-react';
import { AgentMapView } from '@/components/map/agent-map-view';
import { BusinessListPanel } from '@/components/map/BusinessListPanel';
import { LocationSearchInput } from '@/components/map/LocationSearchInput';
import { useActiveTracking } from '@/components/tracking/active-tracking-provider';
import { useTrackingStore } from '@/store/tracking';
import { useAuthStore } from '@/store/auth';
import { getActiveCompanyContext } from '@/lib/company-context';
import { getAuthTokenFromDocument } from '@/lib/auth/session';
import { listAgentTasks, getTaskRoute, listAgentLocations } from '@/lib/api/tracking';
import { useInfiniteSavedLocations } from '@/hooks/use-saved-locations';
import { useViewerCoords } from '@/hooks/use-viewer-coords';
import type { AgentLocationSnapshotItem } from '@/types/tracking';
import type { SavedLocation } from '@/lib/api/saved-locations';
import { isInsideLocationContext, type LocationContext } from '@/lib/map/location-search';
import type { PoiResult } from '@/lib/map/overpass-search';
import { parseTaskMapParams } from '@/lib/tasks/map-navigation';

type AgentLeftTab = 'yours' | 'businesses';

function AgentMapPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isTracking, activeTaskId, startTracking, stopTracking } = useActiveTracking();
  const liveTasks = useTrackingStore((s) => s.liveTasks);
  const hydrateFromRoute = useTrackingStore((s) => s.hydrateFromRoute);
  const hydrateFromSnapshots = useTrackingStore((s) => s.hydrateFromSnapshots);
  const activeTask = activeTaskId ? liveTasks[activeTaskId] : null;
  const viewerCoords = useViewerCoords();

  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);

  const taskFocus = useMemo(
    () => parseTaskMapParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [locationCtx, setLocationCtx] = useState<LocationContext | null>(null);
  const [focusLocation, setFocusLocation] = useState<SavedLocation | null>(null);
  const [focusPoiId, setFocusPoiId] = useState<string | null>(null);
  const [showPinnedBusinesses, setShowPinnedBusinesses] = useState(true);
  const [leftTab, setLeftTab] = useState<AgentLeftTab>('yours');
  const [leftSearchQuery, setLeftSearchQuery] = useState('');
  const [debouncedLeftSearch, setDebouncedLeftSearch] = useState('');
  const [listHiddenForDetail, setListHiddenForDetail] = useState(false);

  const viewMode = isTracking && activeTask != null;
  const nearLat = viewerCoords?.latitude;
  const nearLng = viewerCoords?.longitude;

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedLeftSearch(leftSearchQuery.trim()), 300);
    return () => window.clearTimeout(id);
  }, [leftSearchQuery]);

  const yoursSearchQ =
    leftTab === 'yours' && debouncedLeftSearch.length > 0 ? debouncedLeftSearch : undefined;
  const businessesSearchQ =
    leftTab === 'businesses' && debouncedLeftSearch.length > 0 ? debouncedLeftSearch : undefined;

  const {
    items: myPinnedLocations,
    total: myPinnedTotal,
    isLoading: myPinsLoading,
    hasNextPage: hasNextMyPinsPage,
    isFetchingNextPage: isFetchingNextMyPinsPage,
    fetchNextPage: fetchNextMyPinsPage,
  } = useInfiniteSavedLocations({
    mine: true,
    q: yoursSearchQ,
    near_lat: nearLat,
    near_lng: nearLng,
  });

  const {
    items: allBusinessLocations,
    total: allBusinessesTotal,
    isLoading: businessesLoading,
    hasNextPage: hasNextBusinessesPage,
    isFetchingNextPage: isFetchingNextBusinessesPage,
    fetchNextPage: fetchNextBusinessesPage,
  } = useInfiniteSavedLocations({
    q: businessesSearchQ,
    near_lat: nearLat,
    near_lng: nearLng,
    enabled: leftTab === 'businesses',
  });

  const displayedMyPins = useMemo(() => {
    if (!locationCtx) return myPinnedLocations;
    return myPinnedLocations.filter((location) => isInsideLocationContext(location, locationCtx));
  }, [myPinnedLocations, locationCtx]);

  const displayedBusinesses = useMemo(() => {
    if (!locationCtx) return allBusinessLocations;
    return allBusinessLocations.filter((location) => isInsideLocationContext(location, locationCtx));
  }, [allBusinessLocations, locationCtx]);

  // Search hits from the active left-panel tab stay visible on the map.
  const mapExtraLocations = useMemo(() => {
    if (debouncedLeftSearch.length === 0) return [] as SavedLocation[];
    if (leftTab === 'yours') return myPinnedLocations.slice(0, 12);
    return allBusinessLocations.slice(0, 12);
  }, [leftTab, debouncedLeftSearch, myPinnedLocations, allBusinessLocations]);

  const yoursTitle =
    myPinnedTotal != null
      ? `Your Pins (${myPinnedTotal})`
      : 'Your Pins';

  const businessesTitle =
    allBusinessesTotal != null
      ? `Businesses (${allBusinessesTotal})`
      : 'Businesses';

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

      startTracking(taskId, companyId, token);
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
    setResumeError(null);
  }, [stopTracking]);

  const handleLocationSelect = useCallback((ctx: LocationContext | null) => {
    setLocationCtx(ctx);
    setFocusPoiId(ctx?.placeId ?? null);
  }, []);

  const handleSavedLocationClick = useCallback((location: SavedLocation) => {
    setFocusLocation({ ...location });
    setListHiddenForDetail(true);
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
    setListHiddenForDetail(true);
  }, []);

  return (
    <div className="relative">
      <AgentMapView
        showSavedLocations={showPinnedBusinesses}
        focusLocation={focusLocation}
        extraLocations={mapExtraLocations}
        mineSavedLocations={leftTab === 'yours'}
        taskFocus={taskFocus}
        showPinsToggle
        onTogglePins={() => setShowPinnedBusinesses((visible) => !visible)}
        pinsToggleLabel={showPinnedBusinesses ? 'Hide Pins' : 'Show Pins'}
        focusPoiId={focusPoiId}
        searchFocus={locationCtx}
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
        <>
          <div className="absolute top-20 left-4 md:top-8 md:left-8 z-20 flex flex-col items-start gap-2">
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

          {/* Same containment model as management left panel: top + max-height, scroll inside. */}
          <div
            className={`absolute top-[11.5rem] left-4 right-4 md:top-[7.5rem] md:left-8 md:right-auto md:w-[340px] bottom-28 z-10 bg-white rounded-[32px] shadow-2xl shadow-black/10 overflow-hidden flex flex-col min-h-0 transition-opacity ${
              listHiddenForDetail ? 'max-md:hidden' : ''
            }`}
          >
            <div className="px-4 pt-4 pb-2 shrink-0">
              <div className="relative">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  size={15}
                  strokeWidth={2}
                />
                <input
                  type="text"
                  placeholder={
                    leftTab === 'yours'
                      ? 'Search your pinned locations…'
                      : 'Search pinned businesses…'
                  }
                  value={leftSearchQuery}
                  onChange={(e) => setLeftSearchQuery(e.target.value)}
                  className="w-full bg-white rounded-full py-3 pl-10 pr-10 text-[13px] shadow-2xl shadow-black/10 outline-none font-medium text-dash-dark placeholder:text-gray-400 border border-slate-100"
                />
                {leftSearchQuery.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setLeftSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
                  >
                    <X size={10} className="text-slate-500" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex border-b border-slate-100 shrink-0 mx-4">
              <button
                type="button"
                onClick={() => {
                  setLeftTab('yours');
                  setLeftSearchQuery('');
                }}
                className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${
                  leftTab === 'yours'
                    ? 'text-dash-dark border-b-2 border-dash-dark'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Your Pins
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeftTab('businesses');
                  setLeftSearchQuery('');
                }}
                className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${
                  leftTab === 'businesses'
                    ? 'text-dash-dark border-b-2 border-dash-dark'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Businesses
              </button>
            </div>

            {leftTab === 'yours' ? (
              <BusinessListPanel
                activeLocation={null}
                pois={[]}
                poiBusy={false}
                savedLocations={displayedMyPins}
                savedLocationsLoading={myPinsLoading}
                savedLocationsTotal={myPinnedTotal}
                hasNextSavedPage={Boolean(hasNextMyPinsPage)}
                isFetchingNextSavedPage={isFetchingNextMyPinsPage}
                onLoadMoreSaved={() => {
                  if (hasNextMyPinsPage && !isFetchingNextMyPinsPage) {
                    void fetchNextMyPinsPage();
                  }
                }}
                pinnedTitleOverride={yoursTitle}
                pinnedEmptyMessage="No pins of yours yet"
                pinnedEmptyHint="Use Location Pinning on the map to save a place"
                  pinnedListHint="Nearest to you · scroll for more"
                  onPoiClick={handlePoiClick}
                  onSavedClick={handleSavedLocationClick}
                />
              ) : (
                <BusinessListPanel
                  activeLocation={null}
                  pois={[]}
                  poiBusy={false}
                  savedLocations={displayedBusinesses}
                  savedLocationsLoading={businessesLoading}
                  savedLocationsTotal={allBusinessesTotal}
                  hasNextSavedPage={Boolean(hasNextBusinessesPage)}
                  isFetchingNextSavedPage={isFetchingNextBusinessesPage}
                  onLoadMoreSaved={() => {
                    if (hasNextBusinessesPage && !isFetchingNextBusinessesPage) {
                      void fetchNextBusinessesPage();
                    }
                  }}
                  pinnedTitleOverride={businessesTitle}
                  pinnedEmptyMessage="No pinned businesses yet"
                  pinnedEmptyHint="Pinned locations from everyone appear here"
                  pinnedListHint="Nearest to you · scroll for more"
                onPoiClick={handlePoiClick}
                onSavedClick={handleSavedLocationClick}
              />
            )}
          </div>

          <div className="absolute top-20 right-4 md:top-8 md:right-8 z-20 w-[min(100%-2rem,24rem)] max-w-sm">
            <LocationSearchInput
              activeLocation={locationCtx}
              onLocationSelect={handleLocationSelect}
              className="w-full bg-transparent shadow-none border-0 p-0"
            />
          </div>

          {listHiddenForDetail && (
            <button
              type="button"
              onClick={() => {
                setListHiddenForDetail(false);
                setFocusLocation(null);
              }}
              className="absolute bottom-28 left-1/2 -translate-x-1/2 z-50 md:hidden rounded-full bg-white px-4 py-2.5 text-[12px] font-bold text-dash-dark shadow-lg border border-slate-200"
            >
              Back to list
            </button>
          )}

          {resumeError && (
            <p className="absolute bottom-24 left-4 z-30 text-[11px] text-red-500 bg-white/95 backdrop-blur rounded-xl px-4 py-2 shadow max-w-[300px]">
              {resumeError}
            </p>
          )}
        </>
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
