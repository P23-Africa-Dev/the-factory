'use client';

import React, { Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import dynamic from 'next/dynamic';

import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import { BottomNavBar } from '@/components/shared/BottomNavBar';
import { useGeolocation, useLocationReporter, useStartTask } from '@/features/tracking';
import { useTaskListItems, useTask, taskKeys, taskApi } from '@/features/tasks';
import { useAuth } from '@/features/auth';
import { useQueryClient } from '@tanstack/react-query';
import { useTrackingStore } from '@/store/tracking';
import { getActiveCompanyId, appStore } from '@/lib/storage/stores';
import { env } from '@/constants/env';
import { getDb } from '@/lib/db/client';
import { syncEngine } from '@/lib/sync/syncEngine';
import { getRecentDestinations, saveRecentDestination, type RecentDestination } from '@/lib/map/recentDestinations';

// Dynamically import MapboxMap with SSR disabled to prevent server-side window/document errors
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
type TransportMode = 'driving' | 'cycling' | 'walking';

const MODE_LABELS: Record<TransportMode, string> = {
  driving: 'Car',
  cycling: 'Two-wheeler',
  walking: 'Walking',
};

// Lagos traffic-adjusted speed constants (Q3:C)
const SPEED_KPH: Record<TransportMode, number> = {
  driving: 30,
  cycling: 20,
  walking: 5,
};

interface SelectedDestination {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  taskId: number;
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

function etaMinutes(distanceM: number, mode: TransportMode): number {
  const speedMps = (SPEED_KPH[mode] * 1000) / 3600;
  return Math.max(1, Math.ceil(distanceM / speedMps / 60));
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
}: {
  transportMode: TransportMode;
  onSelectMode: (mode: TransportMode) => void;
  etaByMode: Record<TransportMode, number | null>;
}) {
  const etaLabel = (min: number | null) => formatDuration(min);

  const MODES: Array<{ mode: TransportMode; icon: string }> = [
    { mode: 'driving', icon: '/assets/car-02.png' },
    { mode: 'cycling', icon: '/assets/motorbike-02.png' },
    { mode: 'walking', icon: '/assets/walking.png' },
  ];

  return (
    <div className="bg-[#F2F4F5] rounded-t-3xl px-5 pb-3 pt-2 text-[#09232D] border-t border-gray-200">
      <div className="flex justify-center mb-3">
        <div className="w-9 h-1 rounded-full bg-gray-300" />
      </div>

      <div className="flex items-center justify-between mb-4">
        <h4 className="font-sans font-bold text-base text-[#09232D]">
          {MODE_LABELS[transportMode]}
        </h4>
        <div className="flex gap-2">
          <button className="w-9 h-9 rounded-full bg-[#E5E9EB] hover:bg-[#D9DFE2] flex items-center justify-center transition-colors">
            <img src="/assets/send-icon.png" alt="Send" className="w-[25px] h-[25px] object-contain" />
          </button>
          <button className="w-9 h-9 rounded-full bg-[#E5E9EB] hover:bg-[#D9DFE2] flex items-center justify-center transition-colors">
            <img src="/assets/task-icon.png" alt="Tasks" className="w-[25px] h-[25px] object-contain" />
          </button>
          <button className="w-9 h-9 rounded-full bg-[#E5E9EB] hover:bg-[#D9DFE2] flex items-center justify-center transition-colors">
            <img src="/assets/cancel-icon.png" alt="Cancel" className="w-[25px] h-[25px] object-contain" />
          </button>
        </div>
      </div>

      <div className="h-[1px] bg-gray-200 mb-3" />

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
  onStart,
  onEnd,
}: {
  phase: MapPhase;
  hasDestination: boolean;
  isStarting: boolean;
  onStart: () => void;
  onEnd: () => void;
}) {
  if (phase === 'activity_ended') {
    return (
      <div className="mx-auto w-[344px] h-[67px] rounded-[60px] bg-[#D1D5D8] flex items-center justify-center">
        <span className="font-sans font-medium text-sm text-[#8F9098]">Activity Ended</span>
      </div>
    );
  }

  const canStart = hasDestination && phase === 'destination_selected';

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
    return (
      <button
        onClick={onEnd}
        style={activeButtonStyle}
        className="mx-auto flex items-center justify-between text-white active:scale-[0.98] transition-all duration-200"
      >
        <span className="font-sans font-bold text-base pl-4">‹‹</span>
        <span className="font-sans font-bold text-sm">End Activity</span>
        <div className="w-[44px] h-[44px] rounded-full bg-white flex items-center justify-center text-[#09232D] text-xs mr-2">
          ◀
        </div>
      </button>
    );
  }

  if (isStarting) {
    return (
      <div
        style={activeButtonStyle}
        className="mx-auto flex items-center justify-center gap-3 text-white"
      >
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        <span className="font-sans font-bold text-sm">Starting…</span>
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
        Start Activity
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

// ─── DestinationSearch ────────────────────────────────────────────────────────

function DestinationSearch({
  searchQuery,
  onQueryChange,
  results,
  onSelect,
  onClose,
}: {
  searchQuery: string;
  onQueryChange: (q: string) => void;
  results: RecentDestination[];
  onSelect: (dest: RecentDestination) => void;
  onClose: () => void;
}) {
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
          {results.length > 0 ? (
            <div>
              <div className="px-4 pt-4 pb-2 text-white font-bold text-sm tracking-wider uppercase opacity-40">
                Recent
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
          ) : (
            <div className="flex items-center justify-center py-10 text-gray-400 text-xs font-semibold uppercase tracking-wider">
              {searchQuery.trim() ? 'No destinations found' : 'Search for a place'}
            </div>
          )}
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
  onClose,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  results: GeocodedPlace[];
  destination: SelectedDestination | null;
  onSelect: (place: GeocodedPlace) => void;
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
  onDone,
}: {
  visible: boolean;
  taskId: number;
  onDone: () => void;
}) {
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
    setIsSubmitting(true);
    try {
      // Write to IndexedDB proof queue for background sync safety
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

      const formData = new FormData();
      formData.append('company_id', String(companyId));
      if (note.trim()) formData.append('notes', note.trim());
      photos.forEach((file) => {
        formData.append('photos[]', file);
      });

      await taskApi.completeTask(taskId, formData);

      console.log('Task completed from map tab successfully', { taskId, hasNote: !!note.trim(), photoCount: photos.length });

      setNote('');
      setPhotos([]);
      setPreviews([]);
      onDone();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not complete task. Please try again.';
      alert(`Completion failed: ${msg}`);
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
            disabled={isSubmitting}
            className="flex-1 h-12 rounded-xl bg-[#75ADAF] hover:bg-[#66989A] text-white font-bold text-xs active:scale-95 transition-all flex items-center justify-center"
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

  const { lastPosition, getCurrentPosition, checkPermission, requestPermission } = useGeolocation();
  const { data: tasks = [] } = useTaskListItems();
  const { mutate: startTask, isPending: isStarting } = useStartTask();
  const { user } = useAuth();
  const currentAgentId = user?.id != null ? Number(user.id) : null;

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

  const { data: activeTask } = useTask(resolvedTaskId ? String(resolvedTaskId) : '');
  const companyId = activeTask?.companyId ?? getActiveCompanyId() ?? 0;

  // Auto-fill destination from resolved task
  useEffect(() => {
    if (selectedDestination !== null) return;
    if (!activeTask?.latitude || !activeTask?.longitude) return;
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
    if (!query.trim()) { setGeoDestResults([]); return; }
    const token = env.MAPBOX_TOKEN;
    if (!token) return;
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&country=NG&limit=5`;
      const resp = await fetch(url);
      const data = await resp.json() as { features?: Array<{ text: string; place_name: string; center: [number, number] }> };
      if (data.features) {
        setGeoDestResults(
          data.features.map((f) => ({ name: f.text, address: f.place_name, latitude: f.center[1], longitude: f.center[0] })),
        );
      }
    } catch {}
  }, []);

  const searchOriginPlaces = useCallback(async (query: string): Promise<void> => {
    if (!query.trim()) { setOriginGeoResults([]); return; }
    const token = env.MAPBOX_TOKEN;
    if (!token) return;
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&country=NG&limit=5`;
      const resp = await fetch(url);
      const data = await resp.json() as { features?: Array<{ text: string; place_name: string; center: [number, number] }> };
      if (data.features) {
        setOriginGeoResults(
          data.features.map((f) => ({ name: f.text, address: f.place_name, latitude: f.center[1], longitude: f.center[0] })),
        );
      }
    } catch {}
  }, []);

  // Seed initial agent position for map dot
  useEffect(() => {
    checkPermission().then((status) => {
      if (status === 'granted') getCurrentPosition().catch(() => {});
    });
  }, [checkPermission, getCurrentPosition]);

  // Location reporting — active only during activity_started
  useLocationReporter({
    taskId: selectedDestination?.taskId ?? 0,
    companyId,
    active: phase === 'activity_started' && (selectedDestination?.taskId ?? 0) > 0,
    onArrived: () => {
      setHasArrived(true);
      console.log('Agent arrived at destination (map page)', { taskId: selectedDestination?.taskId });
    },
  });

  // Real-time polyline from WebSocket store
  const livePolyline = useTrackingStore((s) =>
    resolvedTaskId ? s.liveTaskMap[resolvedTaskId]?.polyline ?? EMPTY_POLYLINE : EMPTY_POLYLINE,
  );

  // Static ETAs
  const etaByMode = useMemo((): Record<TransportMode, number | null> => {
    if (!lastPosition || !selectedDestination) {
      return { driving: null, cycling: null, walking: null };
    }
    const dist = haversineMeters(
      lastPosition.coords.latitude,
      lastPosition.coords.longitude,
      selectedDestination.latitude,
      selectedDestination.longitude,
    );
    return {
      driving: etaMinutes(dist, 'driving'),
      cycling: etaMinutes(dist, 'cycling'),
      walking: etaMinutes(dist, 'walking'),
    };
  }, [lastPosition, selectedDestination]);

  // Search results: active task destinations + recents
  const taskDestOptions = useMemo((): RecentDestination[] =>
    tasks
      .filter(
        (t) =>
          t.status !== 'completed' &&
          t.status !== 'cancelled' &&
          t.latitude &&
          t.longitude,
      )
      .map((t) => ({
        name: t.title,
        address: t.address ?? undefined,
        latitude: t.latitude!,
        longitude: t.longitude!,
        taskId: Number(t.id),
      })),
    [tasks],
  );

  const searchResults = useMemo((): RecentDestination[] => {
    const seen = new Set<string>();
    const combined: RecentDestination[] = [];

    if (searchQuery.trim()) {
      for (const r of geoDestResults) {
        seen.add(r.name);
        combined.push(r);
      }
    }

    const taskRecents: RecentDestination[] = [];
    const seenTaskIds = new Set<number>();
    for (const td of taskDestOptions) {
      if (td.taskId !== undefined && !seenTaskIds.has(td.taskId)) {
        seenTaskIds.add(td.taskId);
        taskRecents.push(td);
      }
    }
    for (const rd of recentDestinations) {
      if (rd.taskId === undefined || !seenTaskIds.has(rd.taskId)) {
        taskRecents.push(rd);
      }
    }

    if (!searchQuery.trim()) return taskRecents;

    const q = searchQuery.toLowerCase();
    for (const r of taskRecents) {
      if (
        !seen.has(r.name) &&
        (r.name.toLowerCase().includes(q) || (r.address?.toLowerCase().includes(q) ?? false))
      ) {
        combined.push(r);
      }
    }
    return combined;
  }, [taskDestOptions, recentDestinations, searchQuery, geoDestResults]);

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
    setSelectedDestination({
      name: dest.name,
      address: dest.address,
      latitude: dest.latitude,
      longitude: dest.longitude,
      taskId: taskIdForDest,
    });
    saveRecentDestination(dest);
    setTimeout(() => setRecentDestinations(getRecentDestinations()), 0);
    setIsDestSearchOpen(false);
    setSearchQuery('');
    setGeoDestResults([]);
  }, []);

  const handleSelectOrigin = useCallback((place: GeocodedPlace) => {
    setCustomOrigin(place);
    setIsOriginSearchOpen(false);
    setOriginQuery('');
    setOriginGeoResults([]);
  }, []);

  const handleClearOrigin = useCallback(() => {
    setCustomOrigin(null);
  }, []);

  const handleDestQueryChange = useCallback((q: string) => {
    setSearchQuery(q);
    searchGeoDestPlaces(q);
  }, [searchGeoDestPlaces]);

  const handleOriginQueryChange = useCallback((q: string) => {
    setOriginQuery(q);
    searchOriginPlaces(q);
  }, [searchOriginPlaces]);

  const handleStartActivity = useCallback(async (): Promise<void> => {
    if (!selectedDestination?.taskId) return;
    const taskId = selectedDestination.taskId;

    try {
      const permStatus = await requestPermission();
      if (permStatus !== 'granted') {
        alert('Location access is required to start this activity. Please check settings.');
        return;
      }

      const pos = await getCurrentPosition();
      const existingTask = tasks.find((t) => t.id === String(taskId));

      // Resume in-progress task
      if (existingTask?.status === 'in_progress') {
        useTrackingStore.getState().upsertTask(taskId, {
          status: 'tracking',
          lastPosition: [pos.coords.longitude, pos.coords.latitude],
          polyline: [],
        });
        useTrackingStore.getState().setActiveTrackingTaskId(taskId);
        console.log('Activity resumed from map page', { taskId });
        setPhase('activity_started');
        return;
      }

      startTask(
        {
          taskId,
          payload: {
            companyId,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMeters: pos.coords.accuracy ?? 0,
            recordedAt: new Date(pos.timestamp).toISOString(),
          },
        },
        {
          onSuccess: (data) => {
            useTrackingStore.getState().upsertTask(taskId, {
              trackingSessionId: data.tracking.id,
              status: 'tracking',
              lastPosition: [pos.coords.longitude, pos.coords.latitude],
              polyline: [],
            });
            useTrackingStore.getState().setActiveTrackingTaskId(taskId);
            console.log('Activity started from map page', { taskId, sessionId: data.tracking.id });
            setPhase('activity_started');
            if (data.arrived) setHasArrived(true);
          },
          onError: (err: unknown) => {
            alert(`Could not start activity: ${err instanceof Error ? err.message : 'Please try again.'}`);
          },
        },
      );
    } catch (_err) {
      alert('Location error: Could not get your current position. Please try again.');
    }
  }, [selectedDestination, tasks, companyId, startTask, requestPermission, getCurrentPosition]);

  const handleEndActivity = useCallback((): void => {
    console.log('Activity ended from map page', { taskId: selectedDestination?.taskId });
    setPhase('activity_ended');
  }, [selectedDestination]);

  const handleTaskDone = useCallback((): void => {
    queryClient.invalidateQueries({ queryKey: taskKeys.all });
    useTrackingStore.getState().setActiveTrackingTaskId(null);
    setPhase('idle');
    setSelectedDestination(null);
    setHasArrived(false);
  }, [queryClient]);

  // Derived positions
  const agentLng = customOrigin?.longitude ?? lastPosition?.coords.longitude ?? null;
  const agentLat = customOrigin?.latitude ?? lastPosition?.coords.latitude ?? null;
  const agentPosition = useMemo<[number, number] | null>(
    () => (agentLng != null && agentLat != null ? [agentLng, agentLat] : null),
    [agentLng, agentLat],
  );

  const selectedDestLng = selectedDestination?.longitude ?? null;
  const selectedDestLat = selectedDestination?.latitude ?? null;
  const destinationPosition = useMemo<[number, number] | null>(
    () => (selectedDestLng != null && selectedDestLat != null ? [selectedDestLng, selectedDestLat] : null),
    [selectedDestLng, selectedDestLat],
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0A1D25] text-white overflow-hidden select-none">
      {/* Dynamic Mapbox Map */}
      <div className="absolute inset-0 z-0">
        <MapboxMap
          agentPosition={agentPosition}
          destinationPosition={destinationPosition}
          polylineCoords={livePolyline}
          radiusMeters={null}
          arrived={hasArrived}
          dimmed={phase === 'activity_ended'}
        />
      </div>

      {/* Top overlay: location card + arrival banner */}
      {!isDestSearchOpen && !isOriginSearchOpen && (
        <div className="relative z-10 flex flex-col w-full pt-[env(safe-area-inset-top,16px)] pointer-events-none">
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

      {/* Destination search overlay */}
      {isDestSearchOpen && (
        <DestinationSearch
          searchQuery={searchQuery}
          onQueryChange={handleDestQueryChange}
          results={searchResults}
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
          onClose={() => {
            setIsOriginSearchOpen(false);
            setOriginQuery('');
            setOriginGeoResults([]);
          }}
        />
      )}

      {/* Bottom panel */}
      {!isDestSearchOpen && !isOriginSearchOpen && (
        <div className="fixed bottom-0 inset-x-0 z-20 flex flex-col pointer-events-none pb-[100px]">
          <div className="pointer-events-auto w-full">
            <RouteInfoSheet
              transportMode={transportMode}
              onSelectMode={setTransportMode}
              etaByMode={etaByMode}
            />
            <div className="bg-[#F2F4F5] px-4 pt-3 pb-4">
              <ActivityButton
                phase={phase}
                hasDestination={Boolean(selectedDestination?.taskId)}
                isStarting={isStarting}
                onStart={handleStartActivity}
                onEnd={handleEndActivity}
              />
            </div>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      {!isDestSearchOpen && !isOriginSearchOpen && (
        <BottomNavBar activeTab={1} />
      )}

      {/* Complete notes modal */}
      {selectedDestination && selectedDestination.taskId > 0 && (
        <AddNoteModal
          visible={phase === 'activity_ended'}
          taskId={selectedDestination.taskId}
          onDone={handleTaskDone}
        />
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
