'use client';

import React, { Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import dynamic from 'next/dynamic';

import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import {
  useGeolocation,
  useMapPresenceHeartbeat,
  useStartTask,
  useActiveTracking,
  useTaskRoute,
  buildCompleteFormData,
  hydrateLiveTaskFromRoute,
  trackingApi,
  LocationPermissionGate,
} from '@/features/tracking';
import { useTaskListItems, useTask, taskKeys, taskApi, taskHasMapLocation } from '@/features/tasks';
import { useAuth, useAgentIdentity } from '@/features/auth';
import { getSafeAvatarSrc } from '@/lib/avatar';
import { buildTraveledSegment, sliceRemainingRoute } from '@/lib/map/route-geometry';
import { NavigationRideSheet } from '@/features/tracking/components/NavigationRideSheet';
import {
  MAP_SHEET_COLLAPSED_SNAP_INDEX,
  MAP_SHEET_EXPANDED_SNAP_INDEX,
} from '@/features/tracking/components/MapBottomSheet';
import { useQueryClient } from '@tanstack/react-query';
import { useTrackingStore } from '@/store/tracking';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { env } from '@/constants/env';
import { getMapboxPublicToken } from '@/lib/map/public-env';
import { fetchDirectionsRoute, type DirectionsResult } from '@/lib/map/directions';
import { getDb } from '@/lib/db/client';
import { syncEngine } from '@/lib/sync/syncEngine';
import { getRecentDestinations, saveRecentDestination, type RecentDestination } from '@/lib/map/recentDestinations';
import { showApiErrorToast } from '@/lib/api/errors';
import { openGoogleMapsNavigation, resolveGoogleMapsTravelMode } from '@/lib/map/googleMapsNavigation';
import { resolveTaskDestinationCoords } from '@/lib/map/resolveTaskDestinationCoords';
import {
  isDocumentHidden,
  notifyTrackingArrived,
  notifyTrackingNearDestination,
  requestTrackingNotificationPermission,
} from '@/lib/notifications/trackingAlerts';
import { getApiErrorMessage, startMapTaskSession } from '@/features/tracking/lib/startMapTaskSession';
import { demoSyntheticStartFromDestination, isDemoOrganization } from '@/features/tracking/lib/demoTracking';
import { toast } from '@/lib/toast';
import {
  useSavedLocations,
  useCreateSavedLocation,
  SaveLocationSheet,
  LocationDetailsSheet,
  type SavedLocation,
  type CreateSavedLocationInput,
} from '@/features/locations';
import { getSavedLocationType } from '@/lib/map/locationTypes';
import { searchPlacesWithMapbox } from '@/lib/map/geocoding';
import { reverseGeocode } from '@/lib/map/reverseGeocode';
import type { SavedLocationPin } from '@/features/tracking/components/MapboxMap';
import { MapPin, Plus } from 'lucide-react';

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

// ─── Types & constants ────────────────────────────────────────────────────────

type MapPhase = 'idle' | 'destination_selected' | 'activity_started' | 'activity_ended';
type TrackingStatus = 'idle' | 'connecting' | 'live' | 'error';
type TransportMode = 'driving' | 'cycling' | 'walking';

const MODE_LABELS: Record<TransportMode, string> = {
  driving: 'Car',
  cycling: 'Two-wheeler',
  walking: 'Walking',
};

// Map UI transport modes to Mapbox routing profiles.
// driving-traffic uses real-time + historical congestion data for accuracy.
const PROFILE_MAP: Record<TransportMode, 'driving-traffic' | 'cycling' | 'walking'> = {
  driving: 'driving-traffic',
  cycling: 'cycling',
  walking: 'walking',
};

interface SelectedDestination {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  taskId: number;
  taskStatus?: string;
}

interface GeocodedPlace {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

const EMPTY_POLYLINE: [number, number][] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return '---';
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function canStartTaskActivity(status?: string): boolean {
  return (
    status === 'pending' ||
    status === 'in_progress' ||
    status === 'paused' ||
    status === 'resumed'
  );
}

const LocationIcon = () => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
    <path d="M9.07847 14.2443C8.7894 14.515 8.40293 14.6663 8.00073 14.6663C7.59853 14.6663 7.21213 14.515 6.923 14.2443C4.27535 11.7503 0.727174 8.96427 2.45751 4.91945C3.39309 2.73245 5.63889 1.33301 8.00073 1.33301C10.3626 1.33301 12.6084 2.73245 13.544 4.91945C15.2721 8.95921 11.7327 11.7589 9.07847 14.2443Z" stroke="#FD6046" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M10.3346 7.33333C10.3346 8.622 9.28997 9.66667 8.0013 9.66667C6.71264 9.66667 5.66797 8.622 5.66797 7.33333C5.66797 6.04467 6.71264 5 8.0013 5C9.28997 5 10.3346 6.04467 10.3346 7.33333Z" stroke="#FD6046" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ─── LocationCard ─────────────────────────────────────────────────────────────

function LocationCard({
  destination,
  customOrigin,
  onPickDestination,
  onPickOrigin,
  onClearOrigin,
}: {
  destination: SelectedDestination | null;
  customOrigin: GeocodedPlace | null;
  onPickDestination: () => void;
  onPickOrigin: () => void;
  onClearOrigin: () => void;
}) {
  return (
    <div className="mx-4 mt-4 bg-white rounded-2xl p-4 shadow-lg flex flex-col select-none border border-gray-100">
      {/* Origin row */}
      <div className="flex items-center justify-between cursor-pointer" onClick={onPickOrigin}>
        <div className="flex items-center flex-1 min-w-0">
          <div className="w-3.5 h-3.5 rounded-full bg-[#09232D] mr-3 flex-shrink-0" />
          {customOrigin ? (
            <span className="font-sans font-semibold text-sm text-[#09232D] truncate">
              {customOrigin.name}
            </span>
          ) : (
            <span className="font-sans font-semibold text-sm text-[#09232D] truncate">
              Your Location
            </span>
          )}
        </div>
        {customOrigin ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClearOrigin();
            }}
            className="text-gray-400 hover:text-gray-600 px-2 text-xs font-sans"
          >
            ✕
          </button>
        ) : (
          <span className="text-xs font-semibold text-[#75ADAF] font-sans">Edit</span>
        )}
      </div>

      <div className="h-[1px] bg-gray-100 my-2.5" />

      {/* Destination row */}
      <div className="flex items-center cursor-pointer" onClick={onPickDestination}>
        <LocationIcon />
        <div className="flex-1 min-w-0 ml-3">
          {destination ? (
            <span className="font-sans font-bold text-sm text-[#09232D] block truncate">
              {destination.address ?? destination.name}
            </span>
          ) : (
            <div className="flex items-center text-gray-400 font-sans text-xs">
              <span>Choose destination</span>
              <span className="ml-1 text-sm font-bold leading-none">›</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── RouteInfoSheet ───────────────────────────────────────────────────────────

function RouteInfoSheet({
  transportMode,
  onSelectMode,
  etaByMode,
  onCancel,
  onOpenTasks,
  onShare,
  canCancel,
  isRouteLoading,
}: {
  transportMode: TransportMode;
  onSelectMode: (mode: TransportMode) => void;
  etaByMode: Record<TransportMode, number | null>;
  onCancel: () => void;
  onOpenTasks: () => void;
  onShare: () => void;
  canCancel: boolean;
  isRouteLoading?: boolean;
}) {
  const etaLabel = (min: number | null) => formatDuration(min);

  const MODES: Array<{ mode: TransportMode; icon: string }> = [
    { mode: 'driving', icon: '/assets/car-02.png' },
    { mode: 'cycling', icon: '/assets/motorbike-02.png' },
    { mode: 'walking', icon: '/assets/walking.png' },
  ];

  return (
    <div className="px-5 pb-3 text-[#09232D]">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-sans font-bold text-base text-[#09232D]">
          {isRouteLoading ? 'Calculating route…' : MODE_LABELS[transportMode]}
        </h4>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onShare}
            className="w-9 h-9 rounded-full bg-[#E5E9EB] hover:bg-[#D9DFE2] flex items-center justify-center transition-colors"
          >
            <img src="/assets/send-icon.png" alt="Send" className="w-[25px] h-[25px] object-contain" />
          </button>
          <button
            type="button"
            onClick={onOpenTasks}
            className="w-9 h-9 rounded-full bg-[#E5E9EB] hover:bg-[#D9DFE2] flex items-center justify-center transition-colors"
          >
            <img src="/assets/task-icon.png" alt="Tasks" className="w-[25px] h-[25px] object-contain" />
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={!canCancel}
            className="w-9 h-9 rounded-full bg-[#E5E9EB] hover:bg-[#D9DFE2] flex items-center justify-center transition-colors disabled:opacity-40"
          >
            <img src="/assets/cancel-icon.png" alt="Cancel" className="w-[25px] h-[25px] object-contain" />
          </button>
        </div>
      </div>

      <div className="h-[1px] bg-gray-200 mb-3" />

      {isRouteLoading && (
        <div className="flex items-center gap-2 mb-3 text-sm text-[#1D7293] font-semibold">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#1D7293] border-t-transparent" />
          <span>Loading route preview…</span>
        </div>
      )}

      <div className="flex justify-around items-center">
        {MODES.map(({ mode, icon }) => (
          <button
            key={mode}
            onClick={() => onSelectMode(mode)}
            className="flex-1 py-2 flex flex-row items-center justify-center gap-2 relative focus:outline-none"
          >
            <img src={icon} alt={mode} className="w-[24px] h-[24px] object-contain" />
            <span className={`font-sans text-xs transition-colors duration-150 ${
              transportMode === mode ? 'font-bold text-[#09232D]' : 'font-medium text-gray-400'
            }`}>
              {etaLabel(etaByMode[mode])}
            </span>
            {transportMode === mode && (
              <div className="absolute bottom-0 left-1/4 right-1/4 h-1 rounded-full bg-[#0091FF]" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── ActivityButton ───────────────────────────────────────────────────────────

function ActivityButton({
  phase,
  hasDestination,
  isStarting,
  taskStatus,
  onStart,
}: {
  phase: MapPhase;
  hasDestination: boolean;
  isStarting: boolean;
  taskStatus?: string;
  onStart: () => void;
}) {
  if (taskStatus === 'completed' || taskStatus === 'cancelled') {
    return (
      <div className="mx-auto w-[344px] h-[67px] rounded-[60px] bg-[#D1D5D8] flex items-center justify-center">
        <span className="font-sans font-medium text-sm text-[#8F9098]">Task Closed</span>
      </div>
    );
  }

  if (phase === 'activity_ended') {
    return (
      <div className="mx-auto w-[344px] h-[67px] rounded-[60px] bg-[#D1D5D8] flex items-center justify-center">
        <span className="font-sans font-medium text-sm text-[#8F9098]">Task Ended</span>
      </div>
    );
  }

  const canStart =
    hasDestination &&
    phase === 'destination_selected' &&
    canStartTaskActivity(taskStatus);

  const activeButtonStyle = {
    background: 'linear-gradient(90deg, #1D7293 0%, #09232D 100%)',
    boxShadow: 'inset 0px 4px 8px -2px rgba(0, 0, 0, 0.4)',
    width: '344px',
    height: '67px',
    borderRadius: '60px',
    padding: '10px',
    gap: '8px',
  };

  const disabledButtonStyle = {
    backgroundColor: '#D1D5D8',
    width: '344px',
    height: '67px',
    borderRadius: '60px',
    padding: '10px',
    gap: '8px',
  };

  if (phase === 'activity_started') {
    return null;
  }

  if (isStarting) {
    return (
      <div
        style={activeButtonStyle}
        className="mx-auto flex items-center justify-center gap-3 text-white"
      >
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        <span className="font-sans font-bold text-sm">Starting task…</span>
      </div>
    );
  }

  return (
    <button
      onClick={canStart ? onStart : undefined}
      disabled={!canStart}
      style={canStart ? activeButtonStyle : disabledButtonStyle}
      className={`mx-auto flex items-center justify-between transition-all duration-200 ${
        canStart ? 'text-white active:scale-[0.98]' : 'text-[#8F9098] cursor-not-allowed'
      }`}
    >
      <div className={`relative w-[58px] h-[58px] flex items-center justify-center flex-shrink-0 ${!canStart && 'opacity-50'}`}>
        <img
          src="/assets/Ellipse 436.png"
          alt="Ellipse"
          className="absolute inset-0 w-[58px] h-[58px] object-contain"
        />
        <img
          src="/assets/navigation-03.png"
          alt="Arrow"
          className="relative w-[29px] h-[29px] object-contain"
        />
      </div>

      <span className="font-sans font-bold text-sm text-center flex-1">
        Start Task
      </span>

      <div className={`pr-3 flex-shrink-0 ${!canStart && 'opacity-50'}`}>
        <img
          src="/assets/arrow-right-double.png"
          alt="Double Arrow"
          className="w-[24px] h-[24px] object-contain"
        />
      </div>
    </button>
  );
}

function GoogleMapsActivityButton({
  canStart,
  isStarting,
  onProceed,
}: {
  canStart: boolean;
  isStarting: boolean;
  onProceed: () => void;
}) {
  if (isStarting) return null;

  return (
    <button
      type="button"
      onClick={canStart ? onProceed : undefined}
      disabled={!canStart}
      className={`mx-auto w-[344px] h-[52px] rounded-[60px] border-2 flex items-center justify-center gap-2 font-sans font-bold text-sm transition-all ${
        canStart
          ? 'border-[#1D7293] bg-white text-[#1D7293] active:scale-[0.98]'
          : 'border-[#D1D5D8] bg-[#E8EAEB] text-[#8F9098] cursor-not-allowed'
      }`}
    >
      <img src="/assets/navigation-03.png" alt="" className="w-5 h-5 object-contain" />
      Proceed with Google Maps
    </button>
  );
}

// ─── DestinationSearch ────────────────────────────────────────────────────────

function DestinationSearch({
  searchQuery,
  onQueryChange,
  results,
  taskResults,
  onSelect,
  onClose,
}: {
  searchQuery: string;
  onQueryChange: (q: string) => void;
  results: RecentDestination[];
  taskResults: RecentDestination[];
  onSelect: (dest: RecentDestination) => void;
  onClose: () => void;
}) {
  const showTasks = taskResults.length > 0 && !searchQuery.trim();

  return (
    <div className="fixed inset-0 bg-[#051014]/75 z-50 overflow-y-auto flex flex-col font-sans">
      {/* Click outside backdrop overlay */}
      <div className="fixed inset-0 z-0" onClick={onClose} />

      <div className="relative z-10 w-full pt-4 flex-1 flex flex-col">
        {/* Search header container */}
        <div className="mx-4 mt-2 bg-white rounded-2xl p-4 shadow-lg flex flex-col border border-gray-100">
          <div className="flex items-center text-gray-400">
            <div className="w-3.5 h-3.5 rounded-full bg-gray-300 mr-3" />
            <span className="text-xs font-semibold text-gray-400">Your Location</span>
          </div>

          <div className="h-[1px] bg-gray-100 my-2.5" />

          <div className="flex items-center gap-3">
            <LocationIcon />
            <input
              type="text"
              placeholder="Search destination..."
              value={searchQuery}
              onChange={(e) => onQueryChange(e.target.value)}
              autoFocus
              className="flex-1 bg-transparent border-none text-[#09232D] text-sm focus:outline-none placeholder-gray-400 font-semibold p-0"
            />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 focus:outline-none">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Results List */}
        <div className="mx-4 mt-3 bg-[#0B1E26] rounded-2xl overflow-hidden shadow-2xl border border-white/5 flex-1 max-h-[400px] overflow-y-auto pb-4">
          {showTasks && (
            <div>
              <div className="px-4 pt-4 pb-2 text-white font-bold text-sm tracking-wider uppercase opacity-40">
                Your Tasks
              </div>
              <div className="divide-y divide-white/5">
                {taskResults.map((item) => (
                  <div
                    key={`task-${item.taskId}`}
                    onClick={() => onSelect(item)}
                    className="flex items-center gap-3.5 px-4 py-3.5 cursor-pointer hover:bg-white/[0.04] transition-colors active:opacity-70"
                  >
                    <div className="w-9 h-9 rounded-full bg-[#09232D] flex items-center justify-center flex-shrink-0 border border-white/5">
                      <img src="/assets/task-icon.png" alt="Task" className="w-4.5 h-4.5 object-contain" />
                    </div>
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className="text-sm font-semibold text-white truncate">{item.name}</p>
                      {item.address && (
                        <p className="text-[10px] text-gray-400 truncate mt-1">{item.address}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {results.length > 0 ? (
            <div>
              <div className="px-4 pt-4 pb-2 text-white font-bold text-sm tracking-wider uppercase opacity-40">
                {searchQuery.trim() ? 'Places' : 'Recent'}
              </div>
              <div className="divide-y divide-white/5">
                {results.map((item, index) => (
                  <div
                    key={index}
                    onClick={() => onSelect(item)}
                    className="flex items-center gap-3.5 px-4 py-3.5 cursor-pointer hover:bg-white/[0.04] transition-colors active:opacity-70"
                  >
                    <div className="w-9 h-9 rounded-full bg-[#09232D] flex items-center justify-center flex-shrink-0 border border-white/5">
                      <img
                        src="/assets/clock-arrow-up.png"
                        alt="Recent"
                        className="w-4.5 h-4.5 object-contain"
                      />
                    </div>
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className="text-sm font-semibold text-white truncate">{item.name}</p>
                      {item.address && (
                        <p className="text-[10px] text-gray-400 truncate mt-1">{item.address}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : !showTasks ? (
            <div className="flex items-center justify-center py-10 text-gray-400 text-xs font-semibold uppercase tracking-wider">
              {searchQuery.trim() ? 'No destinations found' : 'Search for a place or pick a task'}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── OriginSearch ─────────────────────────────────────────────────────────────

function OriginSearch({
  query,
  onQueryChange,
  results,
  destination,
  onSelect,
  onUseMyLocation,
  onClose,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  results: GeocodedPlace[];
  destination: SelectedDestination | null;
  onSelect: (place: GeocodedPlace) => void;
  onUseMyLocation: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-[#051014]/75 z-50 overflow-y-auto flex flex-col font-sans">
      <div className="fixed inset-0 z-0" onClick={onClose} />

      <div className="relative z-10 w-full pt-4 flex-1 flex flex-col">
        <div className="mx-4 mt-2 bg-white rounded-2xl p-4 shadow-lg flex flex-col border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-3.5 h-3.5 rounded-full bg-[#09232D] mr-1" />
            <input
              type="text"
              placeholder="Your starting point..."
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              autoFocus
              className="flex-1 bg-transparent border-none text-[#09232D] text-sm focus:outline-none placeholder-gray-400 font-semibold p-0"
            />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 focus:outline-none">
              <X size={18} />
            </button>
          </div>

          <div className="h-[1px] bg-gray-100 my-2.5" />

          <div className="flex items-center text-gray-400 font-sans text-xs">
            <LocationIcon />
            <span className="ml-3 truncate font-bold text-gray-400">
              {destination ? (destination.address ?? destination.name) : 'No destination set'}
            </span>
          </div>
        </div>

        {/* Results List */}
        <div className="mx-4 mt-3 bg-[#0B1E26] rounded-2xl overflow-hidden shadow-2xl border border-white/5 flex-1 max-h-[400px] overflow-y-auto pb-4">
          <div
            onClick={onUseMyLocation}
            className="flex items-center gap-3.5 px-4 py-3.5 cursor-pointer hover:bg-white/[0.04] transition-colors active:opacity-70 border-b border-white/5"
          >
            <div className="w-9 h-9 rounded-full bg-[#09232D] flex items-center justify-center flex-shrink-0 border border-white/5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#75ADAF]" />
            </div>
            <div className="flex-1 min-w-0 leading-tight">
              <p className="text-sm font-semibold text-white">Use my current location</p>
              <p className="text-[10px] text-gray-400 truncate mt-1">GPS — Your Location</p>
            </div>
          </div>
          {results.length > 0 ? (
            <div className="divide-y divide-white/5">
              {results.map((item, index) => (
                <div
                  key={index}
                  onClick={() => onSelect(item)}
                  className="flex items-center gap-3.5 px-4 py-3.5 cursor-pointer hover:bg-white/[0.04] transition-colors active:opacity-70"
                >
                  <div className="w-9 h-9 rounded-full bg-[#09232D] flex items-center justify-center flex-shrink-0 border border-white/5">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0 leading-tight">
                    <p className="text-sm font-semibold text-white truncate">{item.name}</p>
                    <p className="text-[10px] text-gray-400 truncate mt-1">{item.address}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-10 text-gray-400 text-xs font-semibold uppercase tracking-wider">
              {query.trim() ? 'No places found' : 'Type an address to search'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AddNoteModal ─────────────────────────────────────────────────────────────

function AddNoteModal({
  visible,
  taskId,
  hasArrived,
  onDone,
}: {
  visible: boolean;
  taskId: number;
  hasArrived: boolean;
  onDone: () => void;
}) {
  const { getCurrentPosition } = useGeolocation();
  const { stopTracking } = useActiveTracking();
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [_previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const companyId = getActiveCompanyId() ?? 0;

  const handlePickPhoto = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotos((prev) => [...prev, file]);
      const objectUrl = URL.createObjectURL(file);
      setPreviews((prev) => [...prev, objectUrl]);
    }
  };

  const handleTaskDone = async () => {
    if (isSubmitting) return;
    if (!hasArrived) {
      toast.error('Not arrived yet', 'You must reach the destination before completing this task.');
      return;
    }
    if (photos.length === 0) {
      toast.error('Photo required', 'Please attach at least one proof photo.');
      return;
    }
    setIsSubmitting(true);
    try {
      try {
        const db = await getDb();
        for (const file of photos) {
          await db.add('proofQueue', {
            taskId,
            fileBlob: file,
            fileName: `proof_${taskId}_${Date.now()}.jpg`,
            mimeType: file.type || 'image/jpeg',
            uploaded: 0,
            createdAt: new Date().toISOString(),
            attempts: 0,
            nextAttemptAt: new Date().toISOString(),
            lastError: null,
          });
        }
      } catch (dbErr) {
        console.warn('[complete] proofQueue insert failed (non-fatal):', dbErr);
      }
      await syncEngine.scheduleSync();

      let position = {
        latitude: 0,
        longitude: 0,
        accuracyMeters: null as number | null,
        recordedAt: new Date().toISOString(),
      };
      try {
        const pos = await getCurrentPosition();
        position = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy,
          recordedAt: new Date(pos.timestamp).toISOString(),
        };
      } catch {
        // best-effort GPS at completion
      }

      const formData = buildCompleteFormData({
        companyId,
        files: photos,
        notes: note.trim() || undefined,
        position,
      });

      await taskApi.completeTask(taskId, formData);
      await stopTracking();

      toast.success('Task completed', 'Great work — tracking has stopped.');

      setNote('');
      setPhotos([]);
      setPreviews([]);
      onDone();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not complete task. Please try again.';
      toast.error('Completion failed', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-[#051014]/60 backdrop-blur-sm z-[100] flex items-center justify-center p-5 font-sans">
      <div className="relative bg-[#0B3343] border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col gap-4 text-white">
        <h3 className="font-bold text-xl text-white">Add Note</h3>

        <div className="bg-white rounded-xl p-3.5 min-h-[120px] flex flex-col">
          <textarea
            placeholder="Type your note here ..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="w-full bg-transparent border-none text-[#09232D] placeholder-gray-400 focus:outline-none resize-none text-sm font-semibold p-0"
          />
        </div>

        {photos.length > 0 && (
          <p className="text-[11px] font-bold text-[#75ADAF] uppercase tracking-wider">
            {photos.length} photo{photos.length > 1 ? 's' : ''} attached
          </p>
        )}

        {/* Hidden Camera Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex gap-3 mt-2">
          <button
            onClick={handlePickPhoto}
            disabled={isSubmitting}
            className="flex-1 h-12 rounded-xl border-1.5 border-white bg-transparent text-white font-bold text-xs hover:bg-white/5 active:scale-95 transition-all"
          >
            Upload Photo ⬆
          </button>
          <button
            onClick={handleTaskDone}
            disabled={isSubmitting || !hasArrived}
            className="flex-1 h-12 rounded-xl bg-[#75ADAF] hover:bg-[#66989A] text-white font-bold text-xs active:scale-95 transition-all flex items-center justify-center disabled:opacity-40"
          >
            {isSubmitting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              'Task Done'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Content Component ───────────────────────────────────────────────────

function MapContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const taskIdParam = searchParams.get('taskId');
  const destName = searchParams.get('destName');
  const destAddress = searchParams.get('destAddress');
  const destLat = searchParams.get('destLat');
  const destLng = searchParams.get('destLng');

  const isFromTrackingScreen = Boolean(taskIdParam);
  const [phase, setPhase] = useState<MapPhase>(
    isFromTrackingScreen ? 'activity_started' : 'idle',
  );
  const [transportMode, setTransportMode] = useState<TransportMode>('cycling');
  const [selectedDestination, setSelectedDestination] = useState<SelectedDestination | null>(() => {
    if (destName && destLat && destLng) {
      return {
        name: destName,
        address: destAddress || undefined,
        latitude: Number(destLat),
        longitude: Number(destLng),
        taskId: 0,
      };
    }
    return null;
  });
  const [isDestSearchOpen, setIsDestSearchOpen] = useState(false);
  const [isOriginSearchOpen, setIsOriginSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [geoDestResults, setGeoDestResults] = useState<RecentDestination[]>([]);
  const [originQuery, setOriginQuery] = useState('');
  const [originGeoResults, setOriginGeoResults] = useState<GeocodedPlace[]>([]);
  const [customOrigin, setCustomOrigin] = useState<GeocodedPlace | null>(null);
  const [recentDestinations, setRecentDestinations] = useState<RecentDestination[]>([]);
  const [hasArrived, setHasArrived] = useState(false);
  const [plannedRoute, setPlannedRoute] = useState<[number, number][]>([]);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [isLaunchingRide, setIsLaunchingRide] = useState(false);
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>(
    isFromTrackingScreen ? 'live' : 'idle',
  );
  const [sheetSnapIndex, setSheetSnapIndex] = useState(MAP_SHEET_EXPANDED_SNAP_INDEX);
  const startRideInFlightRef = useRef(false);
  const nearAlertShownRef = useRef(false);
  const [distanceRemainingM, setDistanceRemainingM] = useState<number | null>(null);
  const [routesByMode, setRoutesByMode] = useState<Partial<Record<TransportMode, DirectionsResult>>>({});
  const transportModeRef = useRef<TransportMode>(transportMode);
  transportModeRef.current = transportMode;
  // Permission gate overlay for the Start flow: null = hidden.
  const [permGate, setPermGate] = useState<'request' | 'denied' | null>(null);
  const [resumePermBusy, setResumePermBusy] = useState(false);
  const resumePermBootRef = useRef(false);

  // Saved organization locations
  const { data: savedLocations = [] } = useSavedLocations();
  const { mutateAsync: createSavedLocation, isPending: isSavingLocation } = useCreateSavedLocation();
  const [pinMode, setPinMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ lat: number; lng: number; address: string | null } | null>(null);
  const [selectedSavedId, setSelectedSavedId] = useState<number | null>(null);

  const { lastPosition, getCurrentPosition, resolveCurrentPosition, checkPermission, requestPermission, ensureLocationPermission, retryLocationPermission, startWatching, stopWatching } = useGeolocation();
  const { startTracking, stopTracking, activeTaskId } = useActiveTracking();
  const { data: tasks = [] } = useTaskListItems();
  const { mutateAsync: startTaskAsync, isPending: isStarting } = useStartTask();
  const { user } = useAuth();
  const { displayName, profile } = useAgentIdentity();
  const [isOnline, setIsOnline] = useState(true);
  const currentAgentId = user?.id != null ? Number(user.id) : null;

  useEffect(() => {
    const sync = () => setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  // Stop orphan GPS when opening /map without ?taskId (tracking store outlives page state).
  useEffect(() => {
    if (isFromTrackingScreen) return;
    if (activeTaskId == null) return;
    void stopTracking();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only hygiene
  }, []);

  // Determine which task to work with — filter to only tasks assigned to this agent
  const resolvedTaskId = useMemo((): number | null => {
    if (taskIdParam) return Number(taskIdParam);
    const myTasks =
      currentAgentId !== null
        ? tasks.filter((t) => t.assignedAgentId === currentAgentId)
        : tasks;
    const active = myTasks.find((t) => t.status === 'in_progress');
    if (active) return Number(active.id);
    const pending = myTasks.find((t) => t.status === 'pending');
    return pending ? Number(pending.id) : null;
  }, [taskIdParam, tasks, currentAgentId]);

  const trackingTaskId = useMemo((): number | null => {
    const selected = selectedDestination?.taskId ?? 0;
    if (selected > 0) return selected;
    return resolvedTaskId;
  }, [selectedDestination?.taskId, resolvedTaskId]);

  const { data: activeTask } = useTask(resolvedTaskId ? String(resolvedTaskId) : '');
  const { data: trackingTask } = useTask(trackingTaskId ? String(trackingTaskId) : '');
  const companyId = trackingTask?.companyId ?? activeTask?.companyId ?? getActiveCompanyId() ?? 0;

  useMapPresenceHeartbeat({
    companyId: companyId > 0 ? companyId : null,
    enabled: isOnline && trackingTaskId == null && activeTaskId == null,
    latitude: lastPosition?.coords.latitude ?? null,
    longitude: lastPosition?.coords.longitude ?? null,
    accuracyMeters: lastPosition?.coords.accuracy ?? null,
  });

  useEffect(() => {
    if (!taskIdParam || !trackingTask) return;
    if (!taskHasMapLocation(trackingTask)) {
      toast.error('No map location', 'This task has no destination. Open task details to update status.');
      router.replace(`/task/${taskIdParam}`);
    }
  }, [taskIdParam, trackingTask, router]);

  const { data: taskRoute } = useTaskRoute(
    trackingTaskId,
    companyId,
    Boolean(trackingTaskId && companyId),
  );

  const liveTask = useTrackingStore((s) =>
    trackingTaskId ? s.liveTaskMap[trackingTaskId] : undefined,
  );

  useEffect(() => {
    if (!trackingTaskId || !taskRoute) return;
    hydrateLiveTaskFromRoute(trackingTaskId, taskRoute);
    if (taskRoute.arrival) {
      setHasArrived(true);
    }
    // Restore route trail immediately so resume is not blank while directions load.
    if (taskRoute.polyline.length >= 2) {
      setPlannedRoute((prev) => (prev.length >= 2 ? prev : taskRoute.polyline));
    }
    // Seed distance/ETA from last known agent position vs destination.
    const lastPoint =
      taskRoute.points.length > 0 ? taskRoute.points[taskRoute.points.length - 1] : null;
    if (lastPoint && taskRoute.destination) {
      const dist = haversineMeters(
        lastPoint.latitude,
        lastPoint.longitude,
        taskRoute.destination.latitude,
        taskRoute.destination.longitude,
      );
      setDistanceRemainingM((prev) => (prev == null ? dist : prev));
    } else if (taskRoute.start && taskRoute.destination) {
      const dist = haversineMeters(
        taskRoute.start.latitude,
        taskRoute.start.longitude,
        taskRoute.destination.latitude,
        taskRoute.destination.longitude,
      );
      setDistanceRemainingM((prev) => (prev == null ? dist : prev));
    }
  }, [trackingTaskId, taskRoute]);

  useEffect(() => {
    if (liveTask?.status === 'arrived' || liveTask?.arrivedAt) {
      setHasArrived(true);
    }
  }, [liveTask?.status, liveTask?.arrivedAt]);

  useEffect(() => {
    if (!isFromTrackingScreen || !trackingTaskId) return;
    startTracking(trackingTaskId, companyId, {
      onArrived: () => setHasArrived(true),
      onDistanceRemaining: (m) => setDistanceRemainingM(m),
    });
    useTrackingStore.getState().setActiveTrackingTaskId(trackingTaskId);
  }, [isFromTrackingScreen, trackingTaskId, companyId, startTracking]);

  // Resume via /map?taskId=… — ensure location permission without the tracking gate page.
  useEffect(() => {
    if (!isFromTrackingScreen || !trackingTaskId || resumePermBootRef.current) return;

    void (async () => {
      resumePermBootRef.current = true;
      const status = await checkPermission();

      if (status === 'denied') {
        setPermGate('denied');
        return;
      }
      if (status !== 'granted') {
        setPermGate('request');
        return;
      }

      try {
        const pos = await resolveCurrentPosition();
        useTrackingStore.getState().upsertTask(trackingTaskId, {
          lastPosition: [pos.coords.longitude, pos.coords.latitude],
        });
        setPermGate(null);
      } catch {
        setPermGate('request');
      }
    })();
  }, [isFromTrackingScreen, trackingTaskId, checkPermission, resolveCurrentPosition]);

  const handleResumePermission = useCallback(async (): Promise<void> => {
    if (!trackingTaskId) return;
    setResumePermBusy(true);
    try {
      let status = await retryLocationPermission();
      if (status === 'denied') {
        setPermGate('denied');
        return;
      }
      const pos = await resolveCurrentPosition();
      useTrackingStore.getState().upsertTask(trackingTaskId, {
        lastPosition: [pos.coords.longitude, pos.coords.latitude],
      });
      setPermGate(null);
      if (companyId) {
        void trackingApi.getTaskRoute(trackingTaskId, companyId).then((route) => {
          hydrateLiveTaskFromRoute(trackingTaskId, route);
          if (route.arrival) setHasArrived(true);
        }).catch(() => {});
      }
    } catch {
      toast.error('Location error', 'Could not get your current position. Please try again.');
    } finally {
      setResumePermBusy(false);
    }
  }, [trackingTaskId, companyId, retryLocationPermission, resolveCurrentPosition]);

  // Restore destination on resume (e.g. /map?taskId=…) before task detail fetch completes.
  useEffect(() => {
    if (selectedDestination) return;
    const dest = taskRoute?.destination ?? liveTask?.destination;
    if (!dest) return;
    const taskId = trackingTaskId ?? 0;
    setSelectedDestination({
      name: trackingTask?.title ?? activeTask?.title ?? 'Destination',
      address: trackingTask?.address ?? activeTask?.address ?? undefined,
      latitude: dest.latitude,
      longitude: dest.longitude,
      taskId,
      taskStatus: trackingTask?.status ?? activeTask?.status,
    });
  }, [
    selectedDestination,
    taskRoute?.destination,
    liveTask?.destination,
    trackingTaskId,
    trackingTask?.title,
    trackingTask?.address,
    trackingTask?.status,
    activeTask?.title,
    activeTask?.address,
    activeTask?.status,
  ]);

  // Auto-fill destination from resolved task
  useEffect(() => {
    if (selectedDestination !== null) return;
    if (!activeTask || !taskHasMapLocation(activeTask)) return;
    setTimeout(() => setSelectedDestination({
      name: activeTask.title,
      address: activeTask.address ?? undefined,
      latitude: activeTask.latitude,
      longitude: activeTask.longitude,
      taskId: Number(activeTask.id),
    }), 0);
  }, [activeTask, selectedDestination]);

  // Advance idle → destination_selected when destination arrives
  useEffect(() => {
    if (phase === 'idle' && selectedDestination) {
      setTimeout(() => setPhase('destination_selected'), 0);
    }
  }, [phase, selectedDestination]);

  // Load recents on mount
  useEffect(() => {
    setTimeout(() => setRecentDestinations(getRecentDestinations()), 0);
  }, []);

  const searchGeoDestPlaces = useCallback(async (query: string): Promise<void> => {
    if (!query.trim()) {
      setGeoDestResults([]);
      return;
    }
    try {
      const places = await searchPlacesWithMapbox(query, { limit: 5 });
      setGeoDestResults(places);
    } catch {
      setGeoDestResults([]);
    }
  }, []);

  const searchOriginPlaces = useCallback(async (query: string): Promise<void> => {
    if (!query.trim()) {
      setOriginGeoResults([]);
      return;
    }
    try {
      const places = await searchPlacesWithMapbox(query, { limit: 5 });
      setOriginGeoResults(places);
    } catch {
      setOriginGeoResults([]);
    }
  }, []);

  // Boot GPS for map preview. We deliberately do NOT force a permission prompt
  // on page load — the Start flow prompts when the user actually starts a task,
  // which avoids a surprise prompt and a duplicate request. We also suspend this
  // preview watcher during active tracking, since the location reporter owns the
  // GPS watch then (prevents two concurrent watchPosition subscriptions).
  useEffect(() => {
    let mounted = true;
    const bootLocation = async () => {
      const status = await checkPermission();
      if (status !== 'granted') return;
      try {
        await getCurrentPosition();
      } catch {
        // ignore — GPS may be temporarily unavailable
      }
      if (mounted && phase !== 'activity_started') {
        await startWatching(() => {});
      } else if (mounted && isFromTrackingScreen) {
        // Resume after refresh: one-shot GPS fix so route/ETA can compute before reporter starts.
        try {
          await getCurrentPosition();
        } catch {
          // best-effort — restored route origin may still come from taskRoute
        }
      }
    };
    void bootLocation();
    return () => {
      mounted = false;
      stopWatching();
    };
  }, [checkPermission, getCurrentPosition, startWatching, stopWatching, phase, isFromTrackingScreen]);

  // Real-time polyline from WebSocket store
  const livePolyline = liveTask?.polyline ?? EMPTY_POLYLINE;

  const geofenceRadius =
    liveTask?.destination?.radiusMeters ??
    taskRoute?.destination.radius_meters ??
    activeTask?.proximityThreshold ??
    null;

  // Route origin: prefer live GPS, then restored tracking state (resume after refresh).
  const routeOriginPosition = useMemo((): [number, number] | null => {
    if (customOrigin) return [customOrigin.longitude, customOrigin.latitude];
    if (lastPosition) return [lastPosition.coords.longitude, lastPosition.coords.latitude];
    if (liveTask?.lastPosition) return liveTask.lastPosition;
    const routePoints = taskRoute?.points;
    if (routePoints && routePoints.length > 0) {
      const last = routePoints[routePoints.length - 1];
      return [last.longitude, last.latitude];
    }
    if (taskRoute?.start) {
      return [taskRoute.start.longitude, taskRoute.start.latitude];
    }
    return null;
  }, [customOrigin, lastPosition, liveTask?.lastPosition, taskRoute]);

  const effectiveOriginLat = routeOriginPosition?.[1] ?? null;
  const effectiveOriginLng = routeOriginPosition?.[0] ?? null;

  // Fetch routes for all 3 transport modes in parallel using the Mapbox Directions API.
  // Each mode uses its correct profile: driving-traffic (real congestion), cycling, walking.
  // The displayed route geometry on the map also switches per mode from the pre-fetched data.
  useEffect(() => {
    const token = getMapboxPublicToken() || env.MAPBOX_TOKEN;
    if (!token || !selectedDestination) {
      setIsRouteLoading(false);
      return;
    }
    if (effectiveOriginLng == null || effectiveOriginLat == null) {
      setIsRouteLoading(false);
      return;
    }

    const origin: [number, number] = [effectiveOriginLng, effectiveOriginLat];
    const destination: [number, number] = [selectedDestination.longitude, selectedDestination.latitude];
    const fallback: [number, number][] = [origin, destination];
    let cancelled = false;
    setIsRouteLoading(true);

    const modes = (['driving', 'cycling', 'walking'] as const);

    void Promise.all(
      modes.map((mode) =>
        fetchDirectionsRoute(origin, destination, token, PROFILE_MAP[mode]).then((result) => ({
          mode,
          result,
        })),
      ),
    ).then((results) => {
      if (cancelled) return;

      const byMode: Partial<Record<TransportMode, DirectionsResult>> = {};
      for (const { mode, result } of results) {
        if (result) byMode[mode] = result;
      }
      setRoutesByMode(byMode);

      // Set the map route to whichever mode is currently selected
      const current = byMode[transportModeRef.current];
      setPlannedRoute(current && current.coords.length > 1 ? current.coords : fallback);

      // Seed distance remaining from the driving route (most relevant for initial display)
      const seedDist = byMode.driving?.distance ?? byMode.cycling?.distance ?? null;
      setDistanceRemainingM((prev) => (prev == null ? seedDist : prev));

      setIsRouteLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    effectiveOriginLng,
    effectiveOriginLat,
    selectedDestination?.latitude,
    selectedDestination?.longitude,
  ]);

  // When the user switches transport mode, instantly swap the map route from cached data
  useEffect(() => {
    const result = routesByMode[transportMode];
    if (result && result.coords.length > 1) {
      setPlannedRoute(result.coords);
    }
  }, [transportMode, routesByMode]);

  // ETA per mode — directly from the Mapbox API duration (seconds → minutes)
  const etaByMode = useMemo((): Record<TransportMode, number | null> => {
    return {
      driving:  routesByMode.driving  ? Math.ceil(routesByMode.driving.duration  / 60) : null,
      cycling:  routesByMode.cycling  ? Math.ceil(routesByMode.cycling.duration  / 60) : null,
      walking:  routesByMode.walking  ? Math.ceil(routesByMode.walking.duration  / 60) : null,
    };
  }, [routesByMode]);

  // Search results: active task destinations + recents
  const taskDestOptions = useMemo((): RecentDestination[] =>
    tasks
      .filter((t) => taskHasMapLocation(t))
      .map((t) => ({
        name: t.title,
        address: t.address ?? undefined,
        latitude: t.latitude,
        longitude: t.longitude,
        taskId: Number(t.id),
        taskStatus: t.status,
      })),
    [tasks],
  );

  const searchResults = useMemo((): RecentDestination[] => {
    const seen = new Set<string>();
    const combined: RecentDestination[] = [];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      for (const loc of savedLocations) {
        if (!loc.isActive) continue;
        const matches =
          loc.name.toLowerCase().includes(q) ||
          (loc.address?.toLowerCase().includes(q) ?? false) ||
          (loc.type?.toLowerCase().includes(q) ?? false);
        if (matches && !seen.has(loc.name)) {
          seen.add(loc.name);
          combined.push({
            name: loc.name,
            address: loc.address ?? undefined,
            latitude: loc.latitude,
            longitude: loc.longitude,
          });
        }
      }
      for (const r of geoDestResults) {
        if (seen.has(r.name)) continue;
        seen.add(r.name);
        combined.push(r);
      }
    }

    const taskRecents: RecentDestination[] = [];
    const seenTaskIds = new Set<number>();
    for (const rd of recentDestinations) {
      if (rd.taskId !== undefined && seenTaskIds.has(rd.taskId)) continue;
      if (rd.taskId !== undefined) seenTaskIds.add(rd.taskId);
      taskRecents.push(rd);
    }

    if (!searchQuery.trim()) {
      const taskIds = new Set(taskDestOptions.map((t) => t.taskId).filter((id): id is number => id != null));
      return taskRecents.filter((r) => r.taskId == null || !taskIds.has(r.taskId));
    }

    const q = searchQuery.toLowerCase();
    for (const td of taskDestOptions) {
      if (
        !seen.has(td.name) &&
        (td.name.toLowerCase().includes(q) || (td.address?.toLowerCase().includes(q) ?? false))
      ) {
        seen.add(td.name);
        combined.push(td);
      }
    }
    for (const r of taskRecents) {
      if (
        !seen.has(r.name) &&
        (r.name.toLowerCase().includes(q) || (r.address?.toLowerCase().includes(q) ?? false))
      ) {
        combined.push(r);
      }
    }
    return combined;
  }, [taskDestOptions, recentDestinations, searchQuery, geoDestResults, savedLocations]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleOpenDestSearch = useCallback(() => {
    if (phase === 'activity_started') return;
    setSearchQuery('');
    setGeoDestResults([]);
    setIsDestSearchOpen(true);
  }, [phase]);

  const handleOpenOriginSearch = useCallback(() => {
    if (phase === 'activity_started') return;
    setOriginQuery('');
    setOriginGeoResults([]);
    setIsOriginSearchOpen(true);
  }, [phase]);

  const handleSelectDestination = useCallback((dest: RecentDestination) => {
    const taskIdForDest = dest.taskId ?? 0;
    const matchedTask = taskIdForDest > 0 ? tasks.find((t) => t.id === String(taskIdForDest)) : undefined;
    setSelectedDestination({
      name: dest.name,
      address: dest.address,
      latitude: dest.latitude,
      longitude: dest.longitude,
      taskId: taskIdForDest,
      taskStatus: matchedTask?.status ?? dest.taskStatus,
    });
    setPhase('destination_selected');
    saveRecentDestination(dest);
    setTimeout(() => setRecentDestinations(getRecentDestinations()), 0);
    setIsDestSearchOpen(false);
    setSearchQuery('');
    setGeoDestResults([]);
  }, [tasks]);

  const handleSelectOrigin = useCallback((place: GeocodedPlace) => {
    setCustomOrigin(place);
    setIsOriginSearchOpen(false);
    setOriginQuery('');
    setOriginGeoResults([]);
  }, []);

  const handleUseMyLocation = useCallback(() => {
    setCustomOrigin(null);
    setIsOriginSearchOpen(false);
    setOriginQuery('');
    setOriginGeoResults([]);
    void (async () => {
      const status = await ensureLocationPermission();
      if (status !== 'granted') {
        toast.error('Location access needed', 'Enable location permission to use Your Location.');
        return;
      }
      try {
        await getCurrentPosition();
      } catch {
        toast.error('Location unavailable', 'Could not get your current position. Try again.');
      }
    })();
  }, [ensureLocationPermission, getCurrentPosition]);

  const handleClearOrigin = useCallback(() => {
    setCustomOrigin(null);
    void handleUseMyLocation();
  }, [handleUseMyLocation]);

  const handleDestQueryChange = useCallback((q: string) => {
    setSearchQuery(q);
    searchGeoDestPlaces(q);
  }, [searchGeoDestPlaces]);

  const handleOriginQueryChange = useCallback((q: string) => {
    setOriginQuery(q);
    searchOriginPlaces(q);
  }, [searchOriginPlaces]);

  const runStartSession = useCallback(async (permissionRetry = false) => {
    if (!selectedDestination?.taskId) return null;
    if (startRideInFlightRef.current || isLaunchingRide) return null;

    const taskId = selectedDestination.taskId;
    const existingTask = tasks.find((t) => t.id === String(taskId));
    const isResume = existingTask?.status === 'in_progress';

    if (!companyId) {
      toast.error('Session error', 'Company context is missing. Please reload and try again.');
      return null;
    }

    startRideInFlightRef.current = true;
    setIsLaunchingRide(true);
    setTrackingStatus('connecting');
    nearAlertShownRef.current = false;

    const markTrackingLive = () => {
      setTrackingStatus('live');
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    };

    const beginSession = (opts: {
      arrived?: boolean;
      trackingSessionId?: number;
      startPoint: [number, number];
    }) => {
      const { arrived, trackingSessionId, startPoint } = opts;
      const avatarUrl = getSafeAvatarSrc(user?.avatar_url ?? null);
      const point =
        startPoint ??
        useTrackingStore.getState().liveTaskMap[taskId]?.lastPosition ??
        (effectiveOriginLng != null && effectiveOriginLat != null
          ? ([effectiveOriginLng, effectiveOriginLat] as [number, number])
          : null);

      useTrackingStore.getState().upsertTask(taskId, {
        ...(trackingSessionId != null ? { trackingSessionId } : {}),
        status: arrived ? 'arrived' : 'tracking',
        lastPosition: point,
        polyline: point ? [point] : [],
        agentName: displayName,
        agentAvatar: avatarUrl,
        taskTitle: selectedDestination?.name ?? existingTask?.title ?? 'Task',
      });
      setPhase('activity_started');
      setIsLaunchingRide(false);
      if (arrived) setHasArrived(true);
      startTracking(taskId, companyId, {
        onArrived: () => setHasArrived(true),
        onNearDestination: () => {
          if (!nearAlertShownRef.current) {
            nearAlertShownRef.current = true;
            void notifyTrackingNearDestination(taskId);
          }
        },
        onDistanceRemaining: (m) => setDistanceRemainingM(m),
      });
    };

    try {
      const demoSyntheticStart =
        isDemoOrganization(profile) && selectedDestination
          ? demoSyntheticStartFromDestination(
              selectedDestination.latitude,
              selectedDestination.longitude,
            )
          : null;

      const result = await startMapTaskSession({
        taskId,
        companyId,
        isResume,
        lastPosition,
        syntheticStart: demoSyntheticStart,
        customOrigin: customOrigin
          ? { latitude: customOrigin.latitude, longitude: customOrigin.longitude }
          : null,
        effectiveOriginLng,
        effectiveOriginLat,
        resolveLocationPermission: permissionRetry
          ? retryLocationPermission
          : ensureLocationPermission,
        resolveCurrentPosition,
        startTaskAsync,
        beginSession,
        markTrackingLive,
        stopTracking,
        onRouteHydrated: (arrived) => {
          if (arrived) setHasArrived(true);
        },
        onRollback: () => {
          setPhase('destination_selected');
          setIsLaunchingRide(false);
          setTrackingStatus('error');
        },
      });

      if (!result.ok) {
        if (result.reason === 'permission_denied') {
          setIsLaunchingRide(false);
          setTrackingStatus('idle');
          setPermGate('denied');
        } else if (result.reason === 'location_error') {
          setIsLaunchingRide(false);
          setPhase('destination_selected');
          setTrackingStatus('idle');
          toast.error('Location error', 'Could not get your current position. Please try again.');
        } else if (result.reason === 'api_error') {
          toast.error('Could not start task', getApiErrorMessage(result.error));
        }
        return null;
      }

      setPermGate(null);
      if (result.kind === 'resume') {
        toast.success('Tracking resumed', 'You are live again.');
      } else if (result.kind === 'reconnect') {
        toast.success('Tracking active', 'Reconnected to your task.');
      } else {
        toast.success('Task started', 'Tracking is now active.');
      }

      return result;
    } finally {
      startRideInFlightRef.current = false;
    }
  }, [
    selectedDestination,
    tasks,
    companyId,
    isLaunchingRide,
    startTaskAsync,
    startTracking,
    stopTracking,
    ensureLocationPermission,
    retryLocationPermission,
    resolveCurrentPosition,
    lastPosition,
    customOrigin,
    effectiveOriginLng,
    effectiveOriginLat,
    displayName,
    user?.avatar_url,
    queryClient,
  ]);

  const handleStartActivity = useCallback(async (permissionRetry = false): Promise<void> => {
    await runStartSession(permissionRetry);
  }, [runStartSession]);

  useEffect(() => {
    if (!permGate) return;

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void checkPermission().then((status) => {
        if (status !== 'granted') return;
        if (isFromTrackingScreen && phase === 'activity_started') {
          void handleResumePermission();
        } else if (permGate === 'denied') {
          void handleStartActivity(true);
        } else {
          setPermGate(null);
        }
      });
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [permGate, checkPermission, isFromTrackingScreen, phase, handleResumePermission, handleStartActivity]);

  const resolveOpenDestination = useCallback(() => {
    const taskRecord =
      trackingTask ??
      (selectedDestination?.taskId
        ? tasks.find((t) => t.id === String(selectedDestination.taskId))
        : undefined);

    return resolveTaskDestinationCoords({
      liveDestination: liveTask?.destination ?? null,
      routeDestination: taskRoute?.destination ?? null,
      selectedDestination,
      taskRecord: taskRecord
        ? { latitude: taskRecord.latitude, longitude: taskRecord.longitude }
        : null,
    });
  }, [
    trackingTask,
    selectedDestination,
    tasks,
    liveTask?.destination,
    taskRoute?.destination,
  ]);

  const openTaskInGoogleMaps = useCallback(() => {
    const destination = resolveOpenDestination();

    if (!destination) {
      toast.error(
        'Destination unavailable',
        'This task has no valid map coordinates. Update the task location before navigating.',
      );
      return;
    }

    try {
      openGoogleMapsNavigation({
        destination,
        travelMode: resolveGoogleMapsTravelMode(transportMode),
        useDeviceLocationAsOrigin: true,
      });
    } catch {
      toast.error(
        'Destination unavailable',
        'Could not open Google Maps with a valid destination for this task.',
      );
    }
  }, [resolveOpenDestination, transportMode]);

  const handleProceedWithGoogleMaps = useCallback(async (): Promise<void> => {
    if (!resolveOpenDestination()) {
      toast.error(
        'Destination unavailable',
        'This task has no valid map coordinates. Update the task location before navigating.',
      );
      return;
    }

    const notifPerm = await requestTrackingNotificationPermission();
    if (notifPerm === 'denied' || notifPerm === 'unsupported') {
      toast.info(
        'Notifications disabled',
        'Alerts will only show inside the app while you use Google Maps.',
      );
    }

    const result = await runStartSession();
    if (!result?.ok) return;

    openTaskInGoogleMaps();
  }, [runStartSession, openTaskInGoogleMaps]);

  const handleOpenGoogleMaps = useCallback((): void => {
    openTaskInGoogleMaps();
  }, [openTaskInGoogleMaps]);

  useEffect(() => {
    if (phase !== 'activity_started' || trackingStatus === 'live') return;
    if (liveTask?.lastUpdatedAt) {
      setTrackingStatus('live');
    }
  }, [phase, trackingStatus, liveTask?.lastUpdatedAt]);

  useEffect(() => {
    if (phase !== 'activity_started' || trackingStatus !== 'connecting') return;
    const timer = setTimeout(() => setTrackingStatus('live'), 3000);
    return () => clearTimeout(timer);
  }, [phase, trackingStatus]);

  // Success feedback when the agent reaches the destination (once per session).
  const arrivedToastShownRef = useRef(false);
  useEffect(() => {
    if (phase !== 'activity_started') {
      arrivedToastShownRef.current = false;
      return;
    }
    if (hasArrived && !arrivedToastShownRef.current) {
      arrivedToastShownRef.current = true;
      const taskId = trackingTaskId ?? selectedDestination?.taskId;
      if (isDocumentHidden() && taskId) {
        void notifyTrackingArrived(taskId);
      } else {
        toast.success('Destination reached', 'You can complete the task now.');
      }
    }
  }, [phase, hasArrived, trackingTaskId, selectedDestination?.taskId]);

  const handleEndActivity = useCallback((): void => {
    void stopTracking();
    setTrackingStatus('idle');
    if (hasArrived) {
      setPhase('activity_ended');
      return;
    }
    // Not at destination — pause tracking, do not open completion workflow.
    setPhase('destination_selected');
    toast.info('Tracking paused', 'Your task is still in progress. Tap Start when you are ready to continue.');
  }, [stopTracking, hasArrived]);

  const handleShareDestination = useCallback(() => {
    if (!selectedDestination) return;
    const text = `${selectedDestination.name}\n${selectedDestination.latitude}, ${selectedDestination.longitude}`;
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text);
      toast.success('Copied', 'Destination coordinates copied to clipboard.');
    }
  }, [selectedDestination]);

  const handleCancelRoute = useCallback(() => {
    if (phase === 'activity_started') return;
    setSelectedDestination(null);
    setPlannedRoute([]);
    setPhase('idle');
  }, [phase]);

  const handleOpenTaskPicker = useCallback(() => {
    if (phase === 'activity_started') return;
    handleOpenDestSearch();
  }, [phase, handleOpenDestSearch]);

  const handleTaskDone = useCallback((): void => {
    queryClient.invalidateQueries({ queryKey: taskKeys.all });
    setPhase('idle');
    setSelectedDestination(null);
    setHasArrived(false);
    setPlannedRoute([]);
    setTrackingStatus('idle');
  }, [queryClient]);

  // ── Saved locations ──────────────────────────────────────────────────────────

  const savedLocationPins = useMemo<SavedLocationPin[]>(
    () =>
      savedLocations
        .filter((loc) => loc.isActive)
        .map((loc) => ({
          id: loc.id,
          name: loc.name,
          type: loc.type,
          longitude: loc.longitude,
          latitude: loc.latitude,
          color: getSavedLocationType(loc.type).color,
          selected: loc.id === selectedSavedId,
        })),
    [savedLocations, selectedSavedId],
  );

  const selectedSavedLocation = useMemo<SavedLocation | null>(
    () => savedLocations.find((loc) => loc.id === selectedSavedId) ?? null,
    [savedLocations, selectedSavedId],
  );

  const handleMapPin = useCallback((lng: number, lat: number) => {
    setPinMode(false);
    setPendingPin({ lat, lng, address: null });
    void reverseGeocode(lng, lat).then((address) => {
      setPendingPin((prev) =>
        prev && prev.lat === lat && prev.lng === lng ? { ...prev, address } : prev,
      );
    });
  }, []);

  const handleSavedLocationClick = useCallback((id: number) => {
    setSelectedSavedId(id);
  }, []);

  const handleSaveCurrentLocation = useCallback(() => {
    setPinMode(false);
    void (async () => {
      const status = await ensureLocationPermission();
      if (status !== 'granted') {
        toast.error('Location access needed', 'Enable location permission to save your current spot.');
        return;
      }
      try {
        const pos = await getCurrentPosition();
        const { latitude, longitude } = pos.coords;
        setPendingPin({ lat: latitude, lng: longitude, address: null });
        const address = await reverseGeocode(longitude, latitude);
        setPendingPin((prev) =>
          prev && prev.lat === latitude && prev.lng === longitude ? { ...prev, address } : prev,
        );
      } catch {
        toast.error('Location unavailable', 'Could not get your current position. Try again.');
      }
    })();
  }, [ensureLocationPermission, getCurrentPosition]);

  const handleSubmitSavedLocation = useCallback(
    async (input: CreateSavedLocationInput) => {
      try {
        await createSavedLocation(input);
        setPendingPin(null);
      } catch (err) {
        showApiErrorToast(err, 'Could not save location');
      }
    },
    [createSavedLocation],
  );

  const handleTogglePinMode = useCallback(() => {
    setSelectedSavedId(null);
    setPendingPin(null);
    setPinMode((prev) => !prev);
  }, []);

  // Derived positions
  const isNavigating = phase === 'activity_started';
  const agentLng = isNavigating
    ? liveTask?.lastPosition?.[0] ?? lastPosition?.coords.longitude ?? customOrigin?.longitude ?? null
    : customOrigin?.longitude ?? lastPosition?.coords.longitude ?? null;
  const agentLat = isNavigating
    ? liveTask?.lastPosition?.[1] ?? lastPosition?.coords.latitude ?? customOrigin?.latitude ?? null
    : customOrigin?.latitude ?? lastPosition?.coords.latitude ?? null;
  const agentPosition = useMemo<[number, number] | null>(
    () => (agentLng != null && agentLat != null ? [agentLng, agentLat] : null),
    [agentLng, agentLat],
  );

  const mapMode = isNavigating ? 'navigation' as const : 'preview' as const;
  const traveledCoords = useMemo(
    () => buildTraveledSegment(livePolyline),
    [livePolyline],
  );
  const remainingRouteCoords = useMemo(() => {
    if (!isNavigating) return plannedRoute;
    return agentPosition ? sliceRemainingRoute(plannedRoute, agentPosition) : plannedRoute;
  }, [isNavigating, plannedRoute, agentPosition]);

  // Use the API's accurate distance for the selected mode; fall back to haversine if not yet loaded
  const totalRouteDistanceM = useMemo(() => {
    const apiDist = routesByMode[transportMode]?.distance;
    if (apiDist != null) return apiDist;
    if (plannedRoute.length < 2) return null;
    let total = 0;
    for (let i = 1; i < plannedRoute.length; i++) {
      total += haversineMeters(
        plannedRoute[i - 1][1],
        plannedRoute[i - 1][0],
        plannedRoute[i][1],
        plannedRoute[i][0],
      );
    }
    return total;
  }, [routesByMode, transportMode, plannedRoute]);

  const agentAvatarUrl = getSafeAvatarSrc(user?.avatar_url ?? null);
  const agentMarker = useMemo(
    () => ({
      displayName,
      avatarUrl: isOnline ? agentAvatarUrl : null,
      preferInitials: !isOnline,
      headingDegrees: isNavigating
        ? liveTask?.lastHeadingDegrees ?? lastPosition?.coords.heading ?? null
        : lastPosition?.coords.heading ?? null,
      speedMps: isNavigating
        ? liveTask?.lastSpeedMps ?? lastPosition?.coords.speed ?? null
        : lastPosition?.coords.speed ?? null,
    }),
    [
      displayName,
      isOnline,
      agentAvatarUrl,
      isNavigating,
      liveTask?.lastHeadingDegrees,
      liveTask?.lastSpeedMps,
      lastPosition?.coords.heading,
      lastPosition?.coords.speed,
    ],
  );

  const rideTrackingStatus = useMemo((): 'connecting' | 'live' | 'error' => {
    if (trackingStatus === 'error') return 'error';
    if (trackingStatus === 'connecting') return 'connecting';
    return 'live';
  }, [trackingStatus]);

  const destinationMarkerKind = (selectedDestination?.taskId ?? 0) > 0 ? 'task' as const : 'place' as const;

  const selectedDestTask = useMemo(
    () => (selectedDestination?.taskId ? tasks.find((t) => t.id === String(selectedDestination.taskId)) : undefined),
    [selectedDestination?.taskId, tasks],
  );

  const selectedDestLng = selectedDestination?.longitude ?? null;
  const selectedDestLat = selectedDestination?.latitude ?? null;
  const destinationPosition = useMemo<[number, number] | null>(
    () => (selectedDestLng != null && selectedDestLat != null ? [selectedDestLng, selectedDestLat] : null),
    [selectedDestLng, selectedDestLat],
  );

  const isSheetCollapsed = sheetSnapIndex <= MAP_SHEET_COLLAPSED_SNAP_INDEX;
  const showMapChrome = !isDestSearchOpen && !isOriginSearchOpen;

  const handleSheetSnapChange = useCallback((snapIndex: number) => {
    setSheetSnapIndex(snapIndex);
  }, []);

  useEffect(() => {
    if (selectedDestination) {
      setSheetSnapIndex(MAP_SHEET_EXPANDED_SNAP_INDEX);
    }
  }, [selectedDestination?.taskId, selectedDestination?.latitude, selectedDestination?.longitude]);

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0A1D25] text-white overflow-hidden select-none">
      {/* Dynamic Mapbox Map */}
      <div className="absolute inset-0 z-0">
        <MapboxMap
          agentPosition={agentPosition}
          destinationPosition={destinationPosition}
          traveledCoords={traveledCoords}
          remainingRouteCoords={remainingRouteCoords}
          mode={mapMode}
          agentMarker={agentMarker}
          destinationMarkerKind={destinationMarkerKind}
          radiusMeters={geofenceRadius}
          arrived={hasArrived}
          dimmed={phase === 'activity_ended'}
          savedLocations={savedLocationPins}
          onSavedLocationClick={handleSavedLocationClick}
          pinMode={pinMode}
          onMapPin={handleMapPin}
        />
      </div>

      {(isRouteLoading || isLaunchingRide || isStarting || trackingStatus === 'connecting') && (
        <div className="absolute inset-x-0 top-1/2 z-[15] flex justify-center pointer-events-none px-6">
          <div className="bg-[#09232D]/90 text-white rounded-2xl px-5 py-4 shadow-xl flex items-center gap-3 max-w-sm w-full border border-white/10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#75ADAF] border-t-transparent flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-sans font-bold text-sm truncate">
                {isLaunchingRide || isStarting || trackingStatus === 'connecting'
                  ? 'Starting your ride…'
                  : 'Calculating route…'}
              </p>
              <p className="font-sans text-xs text-white/70 truncate">
                {isLaunchingRide || isStarting || trackingStatus === 'connecting'
                  ? 'Connecting GPS tracking and task session'
                  : 'Fetching directions from Mapbox'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top overlay: location card + arrival banner */}
      {showMapChrome && (
        <div
          className={`relative z-10 flex flex-col w-full pt-[env(safe-area-inset-top,16px)] transition-all duration-300 ease-out ${
            isSheetCollapsed
              ? 'opacity-0 -translate-y-3 pointer-events-none'
              : 'opacity-100 translate-y-0 pointer-events-none'
          }`}
        >
          <div className="pointer-events-auto">
            <LocationCard
              destination={selectedDestination}
              customOrigin={customOrigin}
              onPickDestination={handleOpenDestSearch}
              onPickOrigin={handleOpenOriginSearch}
              onClearOrigin={handleClearOrigin}
            />
          </div>
          {hasArrived && phase === 'activity_started' && (
            <div className="mx-4 mt-2 bg-[#113948] border-l-4 border-[#75ADAF] rounded-xl p-3 shadow-lg flex items-center justify-center pointer-events-auto select-none">
              <span className="font-sans font-bold text-xs text-white text-center">
                You&apos;ve arrived at the destination!
              </span>
            </div>
          )}
        </div>
      )}

      {/* Saved-location controls (hidden during active navigation) */}
      {showMapChrome && phase !== 'activity_started' && (
        <div className="absolute right-4 bottom-[44%] z-20 flex flex-col gap-3 items-end pointer-events-none">
          {pinMode && (
            <div className="pointer-events-auto bg-[#09232D]/90 text-white text-xs font-semibold rounded-xl px-3 py-2 shadow-lg border border-white/10 max-w-[200px] text-right">
              Tap the map or long-press to drop a pin
            </div>
          )}
          <button
            type="button"
            onClick={handleSaveCurrentLocation}
            className="pointer-events-auto w-12 h-12 rounded-full bg-white shadow-lg flex items-center justify-center active:scale-95 transition-transform border border-gray-100"
            aria-label="Save current location"
            title="Save current location"
          >
            <MapPin size={20} className="text-[#1D7293]" />
          </button>
          <button
            type="button"
            onClick={handleTogglePinMode}
            className={`pointer-events-auto w-14 h-14 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all ${
              pinMode ? 'bg-[#FD6046] text-white rotate-45' : 'bg-[#1D7293] text-white'
            }`}
            aria-label={pinMode ? 'Cancel pin mode' : 'Add saved location'}
            title={pinMode ? 'Cancel' : 'Add location'}
          >
            <Plus size={26} />
          </button>
        </div>
      )}

      {/* Destination search overlay */}
      {isDestSearchOpen && (
        <DestinationSearch
          searchQuery={searchQuery}
          onQueryChange={handleDestQueryChange}
          results={searchResults}
          taskResults={taskDestOptions}
          onSelect={handleSelectDestination}
          onClose={() => {
            setIsDestSearchOpen(false);
            setSearchQuery('');
            setGeoDestResults([]);
          }}
        />
      )}

      {/* Origin search overlay */}
      {isOriginSearchOpen && (
        <OriginSearch
          query={originQuery}
          onQueryChange={handleOriginQueryChange}
          results={originGeoResults}
          destination={selectedDestination}
          onSelect={handleSelectOrigin}
          onUseMyLocation={handleUseMyLocation}
          onClose={() => {
            setIsOriginSearchOpen(false);
            setOriginQuery('');
            setOriginGeoResults([]);
          }}
        />
      )}

      {/* Bottom draggable sheet */}
      {showMapChrome && (
        <MapBottomSheetDynamic visible onSnapChange={handleSheetSnapChange}>
          {phase === 'activity_started' ? (
            <NavigationRideSheet
              destinationName={selectedDestination?.name ?? 'Destination'}
              etaMinutes={etaByMode[transportMode]}
              distanceRemainingM={distanceRemainingM}
              totalDistanceM={totalRouteDistanceM}
              trackingStatus={rideTrackingStatus}
              lastUpdatedAt={liveTask?.lastUpdatedAt ?? null}
              hasArrived={hasArrived}
              onEnd={handleEndActivity}
              onOpenGoogleMaps={handleOpenGoogleMaps}
            />
          ) : (
            <>
              <RouteInfoSheet
                transportMode={transportMode}
                onSelectMode={setTransportMode}
                etaByMode={etaByMode}
                onCancel={handleCancelRoute}
                onOpenTasks={handleOpenTaskPicker}
                onShare={handleShareDestination}
                canCancel
                isRouteLoading={isRouteLoading}
              />
              <div className="bg-[#F2F4F5] px-4 pt-3 pb-4 flex flex-col gap-3">
                <ActivityButton
                  phase={phase}
                  hasDestination={(selectedDestination?.taskId ?? 0) > 0}
                  isStarting={isStarting || isLaunchingRide}
                  taskStatus={selectedDestination?.taskStatus ?? selectedDestTask?.status}
                  onStart={handleStartActivity}
                />
                <GoogleMapsActivityButton
                  canStart={
                    (selectedDestination?.taskId ?? 0) > 0 &&
                    phase === 'destination_selected' &&
                    canStartTaskActivity(selectedDestination?.taskStatus ?? selectedDestTask?.status)
                  }
                  isStarting={isStarting || isLaunchingRide}
                  onProceed={() => void handleProceedWithGoogleMaps()}
                />
              </div>
            </>
          )}
        </MapBottomSheetDynamic>
      )}

      {/* Saved location details */}
      {selectedSavedLocation && (
        <LocationDetailsSheet
          location={selectedSavedLocation}
          onClose={() => setSelectedSavedId(null)}
          onNavigate={(loc) => {
            setSelectedSavedId(null);
            handleSelectDestination({
              name: loc.name,
              address: loc.address ?? undefined,
              latitude: loc.latitude,
              longitude: loc.longitude,
            });
          }}
        />
      )}

      {/* Save location form */}
      {pendingPin && (
        <SaveLocationSheet
          visible
          latitude={pendingPin.lat}
          longitude={pendingPin.lng}
          initialAddress={pendingPin.address}
          isSubmitting={isSavingLocation}
          onClose={() => setPendingPin(null)}
          onSubmit={handleSubmitSavedLocation}
        />
      )}

      {/* Complete notes modal */}
      {selectedDestination && selectedDestination.taskId > 0 && (
        <AddNoteModal
          visible={phase === 'activity_ended'}
          taskId={selectedDestination.taskId}
          hasArrived={hasArrived}
          onDone={handleTaskDone}
        />
      )}

      {/* Location permission gate for the Start flow */}
      {permGate && (
        <div className="absolute inset-0 z-[120] bg-[#0A1D25]/95 backdrop-blur-sm">
          <LocationPermissionGate
            mode={permGate}
            isBusy={isLaunchingRide || resumePermBusy}
            isResume={isFromTrackingScreen}
            onRequest={() => {
              if (isFromTrackingScreen && phase === 'activity_started') {
                void handleResumePermission();
              } else {
                void handleStartActivity(permGate === 'denied');
              }
            }}
            onDismiss={() => setPermGate(null)}
            fullScreen
          />
        </div>
      )}
    </div>
  );
}

export default function MapPage() {
  return (
    <ScreenErrorBoundary screenName="MapActivity">
      <Suspense fallback={
        <div className="flex flex-1 items-center justify-center min-h-screen bg-[#0A1D25]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
        </div>
      }>
        <MapContent />
      </Suspense>
    </ScreenErrorBoundary>
  );
}
