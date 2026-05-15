'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Navigation, ClipboardList } from 'lucide-react';
import { useActiveTracking } from '@/components/tracking/active-tracking-provider';
import { useTrackingStore } from '@/store/tracking';

const MapView = dynamic(
  () => import('@/components/map/map-view').then((m) => m.MapView),
  {
    ssr: false,
    loading: () => (
      <div
        style={{ height: 'calc(100vh - 64px)' }}
        className="bg-[#e8ecef] animate-pulse"
      />
    ),
  }
);

export default function AgentMapPage() {
  const router = useRouter();
  const { isTracking, activeTaskId } = useActiveTracking();
  const liveTasks = useTrackingStore((s) => s.liveTasks);
  const activeTask = activeTaskId ? liveTasks[activeTaskId] : null;

  if (!isTracking) {
    return (
      <div className="min-h-screen bg-[#f8f9fb] flex flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
          <Navigation size={36} className="text-gray-300" />
        </div>
        <div>
          <h2 className="text-[18px] font-bold text-dash-dark mb-1">No active tracking</h2>
          <p className="text-[13px] text-gray-400 max-w-xs">
            Start a task to see your live location on the map.
          </p>
        </div>
        <button
          onClick={() => router.push('/agent/tasks')}
          className="flex items-center gap-2 px-6 py-3.5 bg-[#7EB5AE] text-white rounded-2xl text-[14px] font-bold shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90 transition-all"
        >
          <ClipboardList size={16} />
          View My Tasks
        </button>
      </div>
    );
  }

  // Show the map centered on the active task. Pass compact=false for full view.
  return (
    <div className="relative">
      {/* Active task banner */}
      {activeTask && (
        <div className="absolute top-3 left-3 right-3 z-10 bg-white/90 backdrop-blur-sm rounded-2xl shadow px-4 py-2.5 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-dash-dark truncate">{activeTask.taskTitle}</p>
            <p className="text-[10px] text-gray-400">Tracking your location</p>
          </div>
          <button
            onClick={() => router.push(`/agent/tasks/${activeTaskId}/tracking`)}
            className="text-[11px] text-dash-teal font-bold shrink-0"
          >
            Details
          </button>
        </div>
      )}
      <MapView />
    </div>
  );
}
