'use client';

import React, { Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  MapPin,
  Plus,
  Eye,
  EyeOff,
  Users,
  Navigation,
  Search,
  X,
  Route,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Briefcase,
} from 'lucide-react';

import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import {
  useGeolocation,
  useFleetAgentLocations,
  useTrackingHealth,
  useTaskRoute,
  type FleetAgentLocation,
} from '@/features/tracking';
import { useTaskListItems, taskHasMapLocation } from '@/features/tasks';
import { useAttendanceMapSnapshots } from '@/features/attendance';
import {
  useSavedLocations,
  useCreateSavedLocation,
  type SavedLocation,
  type CreateSavedLocationInput,
} from '@/features/locations';
import { getSavedLocationType } from '@/lib/map/locationTypes';
import { getMapboxPublicToken } from '@/lib/map/public-env';
import { fetchDirectionsRoute } from '@/lib/map/directions';
import {
  suggestPlaces,
  retrievePlace,
  createSearchSessionToken,
  type PlaceSuggestion,
} from '@/lib/map/place-search';
import { reverseGeocode } from '@/lib/map/reverseGeocode';
import { resolveTaskDestinationCoords } from '@/lib/map/resolveTaskDestinationCoords';
import type { SavedLocationPin, FleetAgentPin } from '@/features/tracking/components/MapboxMap';
import {
  MAP_SHEET_COLLAPSED_SNAP_INDEX,
  MAP_SHEET_EXPANDED_SNAP_INDEX,
} from '@/features/tracking/components/MapBottomSheet';
import { TrackingConnectionStatus } from '@/features/tracking/components/TrackingConnectionStatus';
import { toast } from '@/lib/toast';
import { showApiErrorToast } from '@/lib/api/errors';

const MapBottomSheetDynamic = dynamic(
  () => import('@/features/tracking/components/MapBottomSheet').then((m) => m.MapBottomSheet),
  { ssr: false },
);

const MapboxMap = dynamic(() => import('@/features/tracking/components/MapboxMap'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 bg-[#0A1D25] flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
    </div>
  ),
});

const SaveLocationSheet = dynamic(
  () => import('@/features/locations/components/SaveLocationSheet').then((m) => m.SaveLocationSheet),
  { ssr: false },
);

const LocationDetailsSheet = dynamic(
  () => import('@/features/locations/components/LocationDetailsSheet').then((m) => m.LocationDetailsSheet),
  { ssr: false },
);

type FleetStatusFilter = 'all' | 'online' | 'en_route' | 'delayed' | 'offline';
type BottomSheetTab = 'agents' | 'tasks' | 'places';

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return 'No recent ping';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function normalizeAgentStatus(agent: FleetAgentLocation): 'online' | 'en_route' | 'delayed' | 'offline' {
  const raw = String(agent.status ?? '').toLowerCase();
  if (raw === 'en_route' || raw === 'tracking' || (agent.active_task_id && agent.is_online)) {
    return 'en_route';
  }
  if (raw === 'delayed' || raw === 'stale') {
    return 'delayed';
  }
  if (agent.is_online || raw === 'online' || raw === 'active') {
    return 'online';
  }
  return 'offline';
}

function MapContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const agentIdParam = searchParams.get('agentId');
  const taskIdParam = searchParams.get('taskId');
  const locationIdParam = searchParams.get('locationId');
  const clockInLatParam = searchParams.get('clockInLat');
  const clockInLngParam = searchParams.get('clockInLng');
  const clockInNameParam = searchParams.get('clockInName');

  const { lastPosition: managerGpsLocation } = useGeolocation();

  // Live Fleet Queries
  const {
    data: fleetAgents = [],
    isLoading: isFleetLoading,
    refetch: refetchFleet,
  } = useFleetAgentLocations();
  const { data: trackingHealth } = useTrackingHealth();
  const { data: allTasks = [] } = useTaskListItems();
  const { data: savedLocations = [] } = useSavedLocations();
  const createLocationMutation = useCreateSavedLocation();
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const { data: attendanceSnapshots = [] } = useAttendanceMapSnapshots(todayIso);

  // Layer visibility toggles
  const [showAgentLayer, setShowAgentLayer] = useState(true);
  const [showSavedPlaces, setShowSavedPlaces] = useState(true);
  const [showClockIns, setShowClockIns] = useState(false);

  // Filters & active selections
  const [statusFilter, setStatusFilter] = useState<FleetStatusFilter>('all');
  const [sheetTab, setSheetTab] = useState<BottomSheetTab>('agents');
  const [, setSheetSnapIndex] = useState<number>(MAP_SHEET_COLLAPSED_SNAP_INDEX);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(
    agentIdParam ? Number(agentIdParam) : null,
  );
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(
    taskIdParam ? Number(taskIdParam) : null,
  );
  const [selectedSavedLocation, setSelectedSavedLocation] = useState<SavedLocation | null>(null);

  // Saved Location Pin Creation state
  const [isPinMode, setIsPinMode] = useState(false);
  const [pendingPinCoords, setPendingPinCoords] = useState<{
    latitude: number;
    longitude: number;
    address?: string;
  } | null>(null);

  // Search bar state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isResolvingPlace, setIsResolvingPlace] = useState(false);
  const searchSessionRef = useRef<string>(createSearchSessionToken());

  // Custom inspected destination / route
  const [customDestination, setCustomDestination] = useState<{
    name: string;
    address?: string;
    latitude: number;
    longitude: number;
    radiusMeters?: number | null;
    kind: 'task' | 'place';
  } | null>(null);
  const [plannedRouteCoords, setPlannedRouteCoords] = useState<[number, number][]>([]);

  // Selected Task Route from backend
  const { data: selectedTaskRoute } = useTaskRoute(selectedTaskId);

  // Sync deep-linked agentId
  useEffect(() => {
    if (agentIdParam) {
      const id = Number(agentIdParam);
      if (Number.isFinite(id)) {
        setSelectedAgentId(id);
        setSheetTab('agents');
      }
    }
  }, [agentIdParam]);

  // Sync deep-linked taskId
  useEffect(() => {
    if (!taskIdParam || allTasks.length === 0) return;
    const id = Number(taskIdParam);
    const found = allTasks.find((t) => Number(t.id) === id);
    if (found) {
      setSelectedTaskId(Number(found.id));
      const coords = resolveTaskDestinationCoords(found);
      if (coords) {
        setCustomDestination({
          name: found.title,
          address: found.location ?? undefined,
          latitude: coords.latitude,
          longitude: coords.longitude,
          radiusMeters: found.proximityThreshold ?? 100,
          kind: 'task',
        });
      }
    }
  }, [taskIdParam, allTasks]);

  // Sync deep-linked locationId
  useEffect(() => {
    if (!locationIdParam || savedLocations.length === 0) return;
    const id = Number(locationIdParam);
    const found = savedLocations.find((loc) => loc.id === id);
    if (found) {
      setSelectedSavedLocation(found);
    }
  }, [locationIdParam, savedLocations]);

  // Selected Agent object
  const selectedAgent = useMemo(
    () => fleetAgents.find((a) => a.agent_id === selectedAgentId) ?? null,
    [fleetAgents, selectedAgentId],
  );

  // Filtered Fleet Agents
  const filteredAgents = useMemo(() => {
    return fleetAgents.filter((agent) => {
      const normStatus = normalizeAgentStatus(agent);
      if (statusFilter !== 'all' && normStatus !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = agent.name?.toLowerCase().includes(q);
        const matchTask = agent.active_task_title?.toLowerCase().includes(q);
        return Boolean(matchName || matchTask);
      }
      return true;
    });
  }, [fleetAgents, statusFilter, searchQuery]);

  // Fleet counts by status
  const fleetCounts = useMemo(() => {
    const counts = { all: fleetAgents.length, online: 0, en_route: 0, delayed: 0, offline: 0 };
    for (const a of fleetAgents) {
      const st = normalizeAgentStatus(a);
      counts[st] += 1;
    }
    return counts;
  }, [fleetAgents]);

  // Map pins for Fleet Agents
  const fleetAgentPins = useMemo<FleetAgentPin[]>(() => {
    if (!showAgentLayer) return [];
    return filteredAgents
      .filter(
        (a) =>
          typeof a.latitude === 'number' &&
          typeof a.longitude === 'number' &&
          Number.isFinite(a.latitude) &&
          Number.isFinite(a.longitude),
      )
      .map((a) => ({
        agentId: a.agent_id,
        name: a.name,
        avatarUrl: a.avatar_url,
        latitude: a.latitude as number,
        longitude: a.longitude as number,
        status: normalizeAgentStatus(a),
        selected: a.agent_id === selectedAgentId,
      }));
  }, [showAgentLayer, filteredAgents, selectedAgentId]);

  // Map pins for Saved Locations
  const savedLocationPins = useMemo<SavedLocationPin[]>(() => {
    if (!showSavedPlaces) return [];
    return savedLocations.map((loc) => {
      const meta = getSavedLocationType(loc.type);
      return {
        id: loc.id,
        name: loc.name,
        type: loc.type,
        latitude: loc.latitude,
        longitude: loc.longitude,
        color: meta.color,
        selected: selectedSavedLocation?.id === loc.id,
      };
    });
  }, [showSavedPlaces, savedLocations, selectedSavedLocation]);

  // Clock-in pin (either from URL param or from today's attendance snapshots when toggled)
  const activeClockInPin = useMemo(() => {
    if (clockInLatParam && clockInLngParam) {
      return {
        latitude: Number(clockInLatParam),
        longitude: Number(clockInLngParam),
        agentName: clockInNameParam || 'Agent Clock-In',
        isLate: false,
      };
    }
    if (showClockIns && attendanceSnapshots.length > 0) {
      const snap =
        (selectedAgentId
          ? attendanceSnapshots.find((s) => s.user_id === selectedAgentId)
          : attendanceSnapshots[0]) ?? attendanceSnapshots[0];
      if (snap && typeof snap.latitude === 'number' && typeof snap.longitude === 'number') {
        return {
          latitude: snap.latitude,
          longitude: snap.longitude,
          agentName: snap.user_name ?? snap.agent_name ?? 'Agent',
          avatarUrl: snap.avatar_url,
          isLate: snap.status === 'late',
        };
      }
    }
    return null;
  }, [clockInLatParam, clockInLngParam, clockInNameParam, showClockIns, attendanceSnapshots, selectedAgentId]);

  // Center position for MapboxMap (`agentPosition` prop centers camera when updated)
  const focusedMapPosition = useMemo<[number, number] | null>(() => {
    if (
      selectedAgent &&
      typeof selectedAgent.longitude === 'number' &&
      typeof selectedAgent.latitude === 'number'
    ) {
      return [selectedAgent.longitude, selectedAgent.latitude];
    }
    if (activeClockInPin) {
      return [activeClockInPin.longitude, activeClockInPin.latitude];
    }
    if (selectedSavedLocation) {
      return [selectedSavedLocation.longitude, selectedSavedLocation.latitude];
    }
    if (fleetAgentPins.length > 0) {
      return [fleetAgentPins[0].longitude, fleetAgentPins[0].latitude];
    }
    if (managerGpsLocation) {
      return [managerGpsLocation.coords.longitude, managerGpsLocation.coords.latitude];
    }
    return null;
  }, [selectedAgent, activeClockInPin, selectedSavedLocation, fleetAgentPins, managerGpsLocation]);

  // Route polyline for selected task or agent
  const traveledRouteCoords = useMemo<[number, number][]>(() => {
    if (!selectedTaskRoute?.points?.length) return [];
    return selectedTaskRoute.points
      .filter((p) => typeof p.longitude === 'number' && typeof p.latitude === 'number')
      .map((p) => [p.longitude, p.latitude] as [number, number]);
  }, [selectedTaskRoute]);

  // Compute driving directions preview when both a selected agent and destination exist
  useEffect(() => {
    let cancelled = false;
    if (!customDestination) {
      setPlannedRouteCoords([]);
      return;
    }
    const originLng =
      selectedAgent?.longitude ?? managerGpsLocation?.coords.longitude ?? null;
    const originLat =
      selectedAgent?.latitude ?? managerGpsLocation?.coords.latitude ?? null;

    if (originLng == null || originLat == null) {
      setPlannedRouteCoords([]);
      return;
    }

    const token = getMapboxPublicToken();
    if (!token) return;

    fetchDirectionsRoute(
      [originLng, originLat],
      [customDestination.longitude, customDestination.latitude],
      token,
      'driving-traffic',
    )
      .then((res) => {
        if (!cancelled && res?.coords?.length) {
          setPlannedRouteCoords(res.coords);
        }
      })
      .catch(() => {
        if (!cancelled) setPlannedRouteCoords([]);
      });

    return () => {
      cancelled = true;
    };
  }, [customDestination, selectedAgent?.longitude, selectedAgent?.latitude, managerGpsLocation]);

  // Place Search autocomplete
  useEffect(() => {
    let cancelled = false;
    const q = searchQuery.trim();
    if (!isSearchOpen || q.length < 2) {
      setPlaceSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const proximity: [number, number] | undefined = focusedMapPosition
          ? [focusedMapPosition[0], focusedMapPosition[1]]
          : undefined;
        const results = await suggestPlaces(q, {
          sessionToken: searchSessionRef.current,
          proximity,
        });
        if (!cancelled) setPlaceSuggestions(results);
      } catch {
        if (!cancelled) setPlaceSuggestions([]);
      }
    }, 260);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, isSearchOpen, focusedMapPosition]);

  const handleSelectPlaceSuggestion = useCallback(async (suggestion: PlaceSuggestion) => {
    setIsResolvingPlace(true);
    try {
      const resolved = await retrievePlace(suggestion);
      searchSessionRef.current = createSearchSessionToken();
      if (resolved) {
        setCustomDestination({
          name: resolved.name || suggestion.name,
          address: resolved.address || suggestion.placeFormatted,
          latitude: resolved.lat,
          longitude: resolved.lng,
          kind: 'place',
        });
        setIsSearchOpen(false);
      }
    } catch (err) {
      showApiErrorToast(err, 'Could not retrieve place coordinates.');
    } finally {
      setIsResolvingPlace(false);
    }
  }, []);

  const handleMapPinDrop = useCallback(async (lng: number, lat: number) => {
    setIsPinMode(false);
    setPendingPinCoords({ latitude: lat, longitude: lng });
    try {
      const addr = await reverseGeocode(lng, lat);
      if (addr) {
        setPendingPinCoords({ latitude: lat, longitude: lng, address: addr });
      }
    } catch {
      // keep coordinates even if reverse geocode fails
    }
  }, []);

  const handleSaveNewLocation = useCallback(
    async (input: CreateSavedLocationInput) => {
      try {
        await createLocationMutation.mutateAsync(input);
        setPendingPinCoords(null);
        toast.success('Organization location saved.');
      } catch (err) {
        showApiErrorToast(err, 'Failed to save location.');
      }
    },
    [createLocationMutation],
  );

  const tasksWithCoords = useMemo(
    () => allTasks.filter((t) => taskHasMapLocation(t)),
    [allTasks],
  );

  return (
    <div className="relative w-full h-dvh overflow-hidden bg-[#0A1D25] select-none font-sans">
      {/* Mapbox Canvas */}
      <MapboxMap
        agentPosition={focusedMapPosition}
        destinationPosition={
          customDestination ? [customDestination.longitude, customDestination.latitude] : null
        }
        traveledCoords={traveledRouteCoords}
        remainingRouteCoords={plannedRouteCoords}
        mode="preview"
        destinationMarkerKind={customDestination?.kind ?? 'place'}
        radiusMeters={customDestination?.radiusMeters ?? null}
        arrived={false}
        fleetAgents={fleetAgentPins}
        onFleetAgentClick={(agentId) => {
          setSelectedAgentId(agentId);
          const agent = fleetAgents.find((a) => a.agent_id === agentId);
          if (agent?.active_task_id) {
            setSelectedTaskId(agent.active_task_id);
          }
          setSheetTab('agents');
        }}
        savedLocations={savedLocationPins}
        onSavedLocationClick={(locId) => {
          const found = savedLocations.find((l) => l.id === locId) ?? null;
          setSelectedSavedLocation(found);
        }}
        clockInPin={activeClockInPin}
        pinMode={isPinMode}
        onMapPin={handleMapPinDrop}
      />

      {/* Top Command Overlay */}
      <div className="absolute top-0 left-0 right-0 z-20 pt-3 px-4 pointer-events-none flex flex-col gap-2.5">
        {/* Connection / Live Relay Status */}
        <TrackingConnectionStatus className="pointer-events-auto self-center" />

        {/* Fleet Search & Command Bar */}
        <div className="pointer-events-auto bg-[#0A1D25]/95 backdrop-blur-md border border-white/10 rounded-2xl p-3 shadow-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#1D7293]/30 border border-[#75ADAF]/30 flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 text-[#75ADAF]" />
            </div>
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="flex-1 text-left min-w-0"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white truncate">
                  {selectedAgent
                    ? `Tracking: ${selectedAgent.name}`
                    : customDestination
                      ? customDestination.name
                      : 'Search agents, tasks, or places…'}
                </span>
              </div>
              <p className="text-[10px] text-white/60 truncate">
                {fleetCounts.online + fleetCounts.en_route} active in field ·{' '}
                {tasksWithCoords.length} mapped tasks
                {trackingHealth?.status ? ` · Relay ${trackingHealth.status}` : ''}
              </p>
            </button>

            {(selectedAgentId || customDestination) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedAgentId(null);
                  setSelectedTaskId(null);
                  setCustomDestination(null);
                  setPlannedRouteCoords([]);
                }}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70"
                title="Clear selection"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => refetchFleet()}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/80 active:scale-95 transition-all"
              title="Refresh Fleet Positions"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFleetLoading ? 'animate-spin text-[#75ADAF]' : ''}`} />
            </button>
          </div>

          {/* Layer Toggles Row */}
          <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-white/10 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setShowAgentLayer((v) => !v)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 border transition-all whitespace-nowrap ${
                showAgentLayer
                  ? 'bg-[#10B981]/20 border-[#10B981]/50 text-[#10B981]'
                  : 'bg-white/5 border-white/10 text-white/50'
              }`}
            >
              <Users className="w-3 h-3" />
              Agents ({fleetAgentPins.length})
            </button>

            <button
              type="button"
              onClick={() => setShowSavedPlaces((v) => !v)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 border transition-all whitespace-nowrap ${
                showSavedPlaces
                  ? 'bg-[#75ADAF]/20 border-[#75ADAF]/50 text-[#75ADAF]'
                  : 'bg-white/5 border-white/10 text-white/50'
              }`}
            >
              {showSavedPlaces ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              Places ({savedLocations.length})
            </button>

            <button
              type="button"
              onClick={() => setShowClockIns((v) => !v)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 border transition-all whitespace-nowrap ${
                showClockIns
                  ? 'bg-[#F59E0B]/20 border-[#F59E0B]/50 text-[#F59E0B]'
                  : 'bg-white/5 border-white/10 text-white/50'
              }`}
            >
              <Clock className="w-3 h-3" />
              Clock-Ins ({attendanceSnapshots.length})
            </button>

            <button
              type="button"
              onClick={() => {
                setIsPinMode((v) => !v);
                if (!isPinMode) {
                  toast.info('Tap anywhere on the map to save a company location.');
                }
              }}
              className={`ml-auto px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 border transition-all whitespace-nowrap ${
                isPinMode
                  ? 'bg-[#FD6046] border-[#FD6046] text-white'
                  : 'bg-white/10 border-white/15 text-white'
              }`}
            >
              <Plus className="w-3 h-3" />
              {isPinMode ? 'Tap Map…' : 'Pin Place'}
            </button>
          </div>
        </div>
      </div>

      {/* Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 bg-[#051014]/80 backdrop-blur-sm p-4 flex flex-col">
          <div className="bg-[#0B1E26] border border-white/10 rounded-2xl p-3.5 shadow-2xl">
            <div className="flex items-center gap-2.5">
              <Search className="w-4 h-4 text-[#75ADAF]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search field agent, task title, or street address…"
                autoFocus
                className="flex-1 bg-transparent text-white text-sm font-medium focus:outline-none placeholder-white/40"
              />
              {isResolvingPlace ? (
                <div className="w-4 h-4 rounded-full border-2 border-[#75ADAF] border-t-transparent animate-spin" />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(false)}
                  className="text-white/60 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 bg-[#0B1E26] border border-white/10 rounded-2xl overflow-y-auto max-h-[70vh] divide-y divide-white/5">
            {/* Matching Fleet Agents */}
            {filteredAgents.length > 0 && (
              <div className="p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#75ADAF] mb-2">
                  Field Agents ({filteredAgents.length})
                </p>
                <div className="space-y-1.5">
                  {filteredAgents.slice(0, 6).map((agent) => (
                    <button
                      key={agent.agent_id}
                      type="button"
                      onClick={() => {
                        setSelectedAgentId(agent.agent_id);
                        setIsSearchOpen(false);
                      }}
                      className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-white/5 text-left transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[#1D7293] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {agent.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{agent.name}</p>
                          <p className="text-[10px] text-white/50 truncate">
                            {agent.active_task_title || formatRelativeTime(agent.last_seen_at)}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/80 capitalize">
                        {normalizeAgentStatus(agent).replace('_', ' ')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mapbox Place Suggestions */}
            {placeSuggestions.length > 0 && (
              <div className="p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#75ADAF] mb-2">
                  Map Places
                </p>
                <div className="space-y-1.5">
                  {placeSuggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectPlaceSuggestion(item)}
                      className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 text-left"
                    >
                      <MapPin className="w-4 h-4 text-[#FD6046] flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white truncate">{item.name}</p>
                        {item.placeFormatted && (
                          <p className="text-[10px] text-white/50 truncate">{item.placeFormatted}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fleet Command Bottom Sheet */}
      <MapBottomSheetDynamic
        visible
        onSnapChange={setSheetSnapIndex}
      >
        <div className="px-4 pb-24 pt-1 text-[#09232D] font-sans">
          {/* Selected Agent Live Telemetry Card */}
          {selectedAgent && (
            <div className="mb-3 p-3.5 rounded-2xl bg-[#0A1D25] text-white border border-white/10 shadow-lg">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#1D7293] border-2 border-[#75ADAF] flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {selectedAgent.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-white truncate">{selectedAgent.name}</h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#10B981]/20 text-[#10B981]">
                        {normalizeAgentStatus(selectedAgent).replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/60 truncate">
                      Last ping: {formatRelativeTime(selectedAgent.last_seen_at)}
                      {typeof selectedAgent.speed_mps === 'number' && selectedAgent.speed_mps > 0
                        ? ` · ${(selectedAgent.speed_mps * 3.6).toFixed(1)} km/h`
                        : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAgentId(null)}
                  className="text-white/50 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedAgent.active_task_title && (
                <div className="mt-2.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[9px] uppercase tracking-wider text-[#75ADAF] font-bold block">
                      Active Task
                    </span>
                    <p className="text-xs font-semibold text-white truncate">
                      {selectedAgent.active_task_title}
                    </p>
                  </div>
                  {selectedAgent.active_task_id && (
                    <button
                      type="button"
                      onClick={() => router.push(`/task/${selectedAgent.active_task_id}`)}
                      className="px-2.5 py-1 rounded-lg bg-[#FD6046] text-white text-[10px] font-bold flex items-center gap-1 flex-shrink-0"
                    >
                      Inspect <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 mt-3">
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/field-activity/journeys?userId=${selectedAgent.agent_id}`)
                  }
                  className="py-2 px-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[11px] font-semibold flex items-center justify-center gap-1"
                >
                  <Route className="w-3.5 h-3.5 text-[#75ADAF]" />
                  Journeys
                </button>
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/tasks?assigneeId=${selectedAgent.agent_id}`)
                  }
                  className="py-2 px-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[11px] font-semibold flex items-center justify-center gap-1"
                >
                  <Briefcase className="w-3.5 h-3.5 text-[#75ADAF]" />
                  Tasks
                </button>
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/workforce?userId=${selectedAgent.agent_id}`)
                  }
                  className="py-2 px-2.5 rounded-xl bg-[#1D7293] hover:bg-[#1D7293]/90 text-white text-[11px] font-semibold flex items-center justify-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Attendance
                </button>
              </div>
            </div>
          )}

          {/* Mode Tabs: Field Fleet | Active Tasks | Org Places */}
          <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl mb-3">
            <button
              type="button"
              onClick={() => {
                setSheetTab('agents');
                setSheetSnapIndex(MAP_SHEET_EXPANDED_SNAP_INDEX);
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                sheetTab === 'agents'
                  ? 'bg-[#0A1D25] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Fleet ({fleetAgents.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setSheetTab('tasks');
                setSheetSnapIndex(MAP_SHEET_EXPANDED_SNAP_INDEX);
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                sheetTab === 'tasks'
                  ? 'bg-[#0A1D25] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Mapped Tasks ({tasksWithCoords.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setSheetTab('places');
                setSheetSnapIndex(MAP_SHEET_EXPANDED_SNAP_INDEX);
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                sheetTab === 'places'
                  ? 'bg-[#0A1D25] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Places ({savedLocations.length})
            </button>
          </div>

          {/* TAB 1: FLEET AGENTS */}
          {sheetTab === 'agents' && (
            <div>
              {/* Status filter pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-2">
                {(
                  [
                    { id: 'all', label: `All (${fleetCounts.all})` },
                    { id: 'en_route', label: `En Route (${fleetCounts.en_route})` },
                    { id: 'online', label: `Online (${fleetCounts.online})` },
                    { id: 'delayed', label: `Delayed (${fleetCounts.delayed})` },
                    { id: 'offline', label: `Offline (${fleetCounts.offline})` },
                  ] as const
                ).map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setStatusFilter(pill.id)}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all ${
                      statusFilter === pill.id
                        ? 'bg-[#1D7293] text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {filteredAgents.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-400">
                  No field agents match this status filter.
                </div>
              ) : (
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {filteredAgents.map((agent) => {
                    const st = normalizeAgentStatus(agent);
                    const hasCoords =
                      typeof agent.latitude === 'number' && typeof agent.longitude === 'number';
                    return (
                      <div
                        key={agent.agent_id}
                        onClick={() => {
                          setSelectedAgentId(agent.agent_id);
                          if (!hasCoords) {
                            toast.info(`${agent.name} has not reported GPS coordinates yet.`);
                          }
                        }}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                          selectedAgentId === agent.agent_id
                            ? 'bg-[#0A1D25]/5 border-[#1D7293]'
                            : 'bg-white border-gray-100 hover:border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative w-9 h-9 rounded-full bg-[#0A1D25] text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {agent.name.slice(0, 2).toUpperCase()}
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                                st === 'online'
                                  ? 'bg-emerald-500'
                                  : st === 'en_route'
                                    ? 'bg-sky-500'
                                    : st === 'delayed'
                                      ? 'bg-amber-500'
                                      : 'bg-slate-400'
                              }`}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#09232D] truncate">
                              {agent.name}
                            </p>
                            <p className="text-[11px] text-gray-500 truncate">
                              {agent.active_task_title
                                ? `Task: ${agent.active_task_title}`
                                : formatRelativeTime(agent.last_seen_at)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {hasCoords && (
                            <span className="w-7 h-7 rounded-full bg-[#1D7293]/10 text-[#1D7293] flex items-center justify-center">
                              <Navigation className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MAPPED TASKS */}
          {sheetTab === 'tasks' && (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {tasksWithCoords.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-400">
                  No tasks with geofence coordinates found.
                </div>
              ) : (
                tasksWithCoords.map((task) => {
                  const coords = resolveTaskDestinationCoords(task);
                  return (
                    <div
                      key={task.id}
                      onClick={() => {
                        setSelectedTaskId(Number(task.id));
                        if (coords) {
                          setCustomDestination({
                            name: task.title,
                            address: task.location ?? undefined,
                            latitude: coords.latitude,
                            longitude: coords.longitude,
                            radiusMeters: task.proximityThreshold ?? 100,
                            kind: 'task',
                          });
                        }
                      }}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                        selectedTaskId === Number(task.id)
                          ? 'bg-[#0A1D25]/5 border-[#1D7293]'
                          : 'bg-white border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-[#09232D] truncate">{task.title}</p>
                        <p className="text-[11px] text-gray-500 truncate">
                          {task.assigneeName ? `${task.assigneeName} · ` : ''}
                          {task.location || 'Pinned coordinates'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/task/${task.id}`);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#0A1D25] text-white text-[10px] font-bold flex-shrink-0"
                      >
                        Inspect
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 3: SAVED COMPANY LOCATIONS */}
          {sheetTab === 'places' && (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {savedLocations.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-400">
                  No saved company locations yet. Tap &ldquo;Pin Place&rdquo; above to add one.
                </div>
              ) : (
                savedLocations.map((loc) => (
                  <div
                    key={loc.id}
                    onClick={() => setSelectedSavedLocation(loc)}
                    className="p-3 rounded-xl border border-gray-100 bg-white hover:border-gray-200 flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <MapPin className="w-4 h-4 text-[#1D7293] flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#09232D] truncate">{loc.name}</p>
                        <p className="text-[11px] text-gray-500 truncate">
                          {loc.address || `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {loc.type || 'site'}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </MapBottomSheetDynamic>

      {/* Save New Organization Location Sheet */}
      <SaveLocationSheet
        visible={Boolean(pendingPinCoords)}
        latitude={pendingPinCoords?.latitude ?? 0}
        longitude={pendingPinCoords?.longitude ?? 0}
        initialAddress={pendingPinCoords?.address}
        isSubmitting={createLocationMutation.isPending}
        onClose={() => setPendingPinCoords(null)}
        onSubmit={handleSaveNewLocation}
      />

      {/* Saved Location Details Sheet */}
      <LocationDetailsSheet
        location={selectedSavedLocation}
        onClose={() => setSelectedSavedLocation(null)}
        onNavigate={(loc) => {
          setCustomDestination({
            name: loc.name,
            address: loc.address ?? undefined,
            latitude: loc.latitude,
            longitude: loc.longitude,
            kind: 'place',
          });
          setSelectedSavedLocation(null);
        }}
      />
    </div>
  );
}

export default function ManagerMapPage() {
  return (
    <ScreenErrorBoundary screenName="Fleet Command Map">
      <Suspense
        fallback={
          <div className="w-full h-dvh bg-[#0A1D25] flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
          </div>
        }
      >
        <MapContent />
      </Suspense>
    </ScreenErrorBoundary>
  );
}
