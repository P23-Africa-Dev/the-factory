'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { ArrowLeft, Navigation, CheckCircle, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth';
import { getActiveCompanyContext } from '@/lib/company-context';
import { getAuthTokenFromDocument } from '@/lib/auth/session';
import { createMapboxTransformRequest, getMapboxPublicToken } from '@/lib/config/public-env';
import { useTaskDetail } from '@/hooks/use-tasks';
import { useTrackingWebSocket } from '@/hooks/use-tracking-ws';
import { useActiveTracking } from '@/components/tracking/active-tracking-provider';
import { startTaskTracking } from '@/lib/api/tracking';
import { ApiRequestError } from '@/lib/api/onboarding';
import { LocationPermissionGate } from '@/components/tracking/LocationPermissionGate';
import { CompleteTaskSheet } from '@/components/tracking/CompleteTaskSheet';
import { useTrackingStore } from '@/store/tracking';
import type { GeoReading } from '@/types/tracking';

type Phase = 'permission' | 'ready' | 'tracking' | 'complete';

const MAPBOX_TOKEN = getMapboxPublicToken();

function TrackingMap({
  agentPosition,
  destination,
}: {
  agentPosition: [number, number] | null;
  destination: { lat: number; lng: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const agentMarkerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const center: [number, number] = agentPosition
      ? agentPosition
      : destination
        ? [destination.lng, destination.lat]
        : [3.36, 6.595];

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center,
      zoom: 15,
      interactive: true,
      transformRequest: createMapboxTransformRequest(),
    });
    mapRef.current = map;

    map.on('load', () => {
      // Destination pin
      if (destination) {
        const el = document.createElement('div');
        el.className = 'w-5 h-5 rounded-full bg-purple-500 border-4 border-white shadow-lg';
        new mapboxgl.Marker({ element: el })
          .setLngLat([destination.lng, destination.lat])
          .addTo(map);

        // Arrival radius circle
        map.addSource('arrival-zone', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [destination.lng, destination.lat] },
            properties: {},
          },
        });
        map.addLayer({
          id: 'arrival-zone-fill',
          type: 'circle',
          source: 'arrival-zone',
          paint: {
            'circle-radius': {
              stops: [
                [0, 0],
                [20, 75 / 0.075 / Math.cos((destination.lat * Math.PI) / 180)],
              ],
              base: 2,
            },
            'circle-color': '#9D4EDD',
            'circle-opacity': 0.1,
            'circle-stroke-color': '#9D4EDD',
            'circle-stroke-width': 1,
            'circle-stroke-opacity': 0.4,
          },
        });
      }

      // Agent marker
      if (agentPosition) {
        const el = document.createElement('div');
        el.className =
          'w-5 h-5 rounded-full bg-dash-teal border-4 border-white shadow-lg ring-4 ring-dash-teal/30';
        agentMarkerRef.current = new mapboxgl.Marker({ element: el })
          .setLngLat(agentPosition)
          .addTo(map);
      }
    });

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update agent marker on new position
  useEffect(() => {
    if (!agentPosition || !mapRef.current) return;
    if (agentMarkerRef.current) {
      agentMarkerRef.current.setLngLat(agentPosition);
    }
    mapRef.current.easeTo({ center: agentPosition, duration: 800 });
  }, [agentPosition]);

  return <div ref={containerRef} className="w-full h-full" />;
}

export default function TrackingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const taskId = Number(id);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);
  const { data: task } = useTaskDetail(taskId, companyId ?? undefined);
  const { startTracking, stopTracking, activeTaskId } = useActiveTracking();
  const liveTask = useTrackingStore((s) => s.liveTasks[taskId]);

  useTrackingWebSocket();

  const [phase, setPhase] = useState<Phase>(() =>
    // If already tracking this task, skip straight to tracking phase
    typeof window !== 'undefined' && activeTaskId === taskId ? 'tracking' : 'permission'
  );
  const [initialReading, setInitialReading] = useState<GeoReading | null>(null);
  const [agentPosition, setAgentPosition] = useState<[number, number] | null>(null);
  const [arrived, setArrived] = useState(false);
  const [showCompleteSheet, setShowCompleteSheet] = useState(false);
  const [commencing, setCommencing] = useState(false);

  useEffect(() => {
    if (!liveTask) return;

    queueMicrotask(() => {
      setAgentPosition(liveTask.lastPosition);

      if (liveTask.status === 'arrived') {
        setArrived(true);
      }
    });
  }, [liveTask]);

  const destination =
    task?.latitude && task?.longitude
      ? { lat: task.latitude, lng: task.longitude }
      : null;

  const handleLocationGranted = async (reading: GeoReading) => {
    setInitialReading(reading);
    setAgentPosition([reading.longitude, reading.latitude]);
    setPhase('ready');
  };

  const handleBeginTask = async () => {
    if (!companyId || !initialReading) return;
    setCommencing(true);
    try {
      const token = getAuthTokenFromDocument();
      const res = await startTaskTracking(
        taskId,
        {
          company_id: companyId,
          location_permission_granted: true,
          latitude: initialReading.latitude,
          longitude: initialReading.longitude,
          accuracy_meters: initialReading.accuracyMeters,
          recorded_at: initialReading.recordedAt,
        },
        token
      );

      useTrackingStore.getState().seedFromTaskStart({
        taskId,
        trackingSessionId: res.data.tracking.id,
        userId: user?.id ?? res.data.tracking.started_by_user_id,
        agentName: user?.name,
        agentAvatarUrl: user?.avatar ?? undefined,
        taskTitle: res.data.task.title,
        taskAddress: res.data.task.address ?? res.data.task.location ?? undefined,
        destination:
          typeof res.data.task.latitude === 'number' &&
            typeof res.data.task.longitude === 'number'
            ? {
              lat: res.data.task.latitude,
              lng: res.data.task.longitude,
              radiusM: 75,
            }
            : undefined,
        position: [initialReading.longitude, initialReading.latitude],
        occurredAt: initialReading.recordedAt,
      });

      startTracking(taskId, companyId as number, token, {
        onArrived: () => {
          setArrived(true);
          toast.success("You've arrived at the destination!");
        },
        onError: () => { },
      });

      if (res.data.arrived) {
        setArrived(true);
        toast.success("You're already at the destination!");
      }

      setPhase('tracking');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const first = err.errors ? Object.values(err.errors)[0]?.[0] : null;
        toast.error(first ?? err.message ?? 'Failed to start tracking.');
      } else {
        toast.error('Failed to start task.');
      }
    } finally {
      setCommencing(false);
    }
  };

  const handleCompleteSuccess = () => {
    stopTracking();
    setShowCompleteSheet(false);
    router.push('/agent/tasks');
  };

  return (
    <div className="h-screen flex flex-col bg-[#f8f9fb] overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 flex items-center gap-3 shrink-0 z-10">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center"
        >
          <ArrowLeft size={18} className="text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-dash-dark truncate">
            {task?.title ?? `Task #${taskId}`}
          </p>
          {phase === 'tracking' && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <p className="text-[11px] text-gray-400">Tracking active</p>
            </div>
          )}
        </div>
      </div>

      {/* Phase A — Permission */}
      {phase === 'permission' && (
        <div className="flex-1 overflow-y-auto flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <LocationPermissionGate
              onGranted={handleLocationGranted}
              onDenied={() => router.back()}
              onCancel={() => router.back()}
            />
          </div>
        </div>
      )}

      {/* Phase B — Ready to start */}
      {phase === 'ready' && initialReading && (
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-6 gap-6">
          <div className="w-16 h-16 rounded-full bg-dash-teal/10 flex items-center justify-center">
            <Navigation size={28} className="text-dash-teal" />
          </div>
          <div className="text-center">
            <h2 className="text-[18px] font-bold text-dash-dark mb-1">Ready to go</h2>
            <p className="text-[13px] text-gray-500">
              GPS lock confirmed (±{Math.round(initialReading.accuracyMeters ?? 0)}m)
            </p>
            {destination && (
              <div className="flex items-center justify-center gap-1.5 mt-2 text-[12px] text-gray-400">
                <MapPin size={12} />
                {task?.address ?? task?.location ?? 'Destination set'}
              </div>
            )}
          </div>
          <button
            onClick={handleBeginTask}
            disabled={commencing}
            className="w-full max-w-xs py-4 bg-[#7EB5AE] text-white rounded-2xl text-[15px] font-bold shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {commencing ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Navigation size={16} />
            )}
            {commencing ? 'Starting…' : 'Begin Task'}
          </button>
        </div>
      )}

      {/* Phase C — Active tracking */}
      {phase === 'tracking' && (
        <>
          {/* Map fills remaining space */}
          <div className="flex-1 relative">
            <TrackingMap agentPosition={agentPosition} destination={destination} />

            {/* GPS accuracy badge */}
            {initialReading?.accuracyMeters && (
              <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5 shadow text-[11px] text-gray-600 font-semibold">
                ±{Math.round(initialReading.accuracyMeters)}m accuracy
              </div>
            )}

            {/* Arrived banner */}
            {arrived && (
              <div className="absolute top-3 left-3 right-14 bg-green-500 text-white rounded-xl px-4 py-2.5 shadow-lg flex items-center gap-2">
                <CheckCircle size={16} />
                <span className="text-[13px] font-bold">Arrived at destination!</span>
              </div>
            )}
          </div>

          {/* Bottom action bar */}
          <div className="bg-white border-t border-gray-100 px-5 py-4 pb-safe shrink-0">
            <button
              onClick={() => setShowCompleteSheet(true)}
              className={`w-full py-4 rounded-2xl text-[14px] font-bold flex items-center justify-center gap-2 transition-all ${arrived
                  ? 'bg-[#7EB5AE] text-white shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90'
                  : 'bg-gray-100 text-gray-400'
                }`}
            >
              <CheckCircle size={16} />
              Complete Task
            </button>
            {!arrived && (
              <p className="text-center text-[11px] text-gray-400 mt-2">
                Complete task button activates when you arrive at the destination.
              </p>
            )}
          </div>
        </>
      )}

      {/* Complete sheet overlay */}
      {showCompleteSheet && companyId && (
        <CompleteTaskSheet
          taskId={taskId}
          companyId={companyId}
          minimumPhotos={task?.minimum_photos_required ?? 1}
          onSuccess={handleCompleteSuccess}
          onClose={() => setShowCompleteSheet(false)}
        />
      )}
    </div>
  );
}
