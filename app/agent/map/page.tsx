'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Navigation, ClipboardList, Radio, X } from 'lucide-react';
import { AgentMapView } from '@/components/map/agent-map-view';
import { useActiveTracking } from '@/components/tracking/active-tracking-provider';
import { useTrackingStore } from '@/store/tracking';
import { useAuthStore } from '@/store/auth';
import { getActiveCompanyContext } from '@/lib/company-context';
import { getAuthTokenFromDocument } from '@/lib/auth/session';
import { listAgentTasks, getTaskRoute, listAgentLocations } from '@/lib/api/tracking';
import type { AgentLocationSnapshotItem } from '@/types/tracking';

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
  // viewMode = true when we loaded a task from the API (not actively tracking on this device)
  const [viewMode, setViewMode] = useState(false);

  const handleViewActiveTracking = useCallback(async () => {
    if (!companyId || !user?.id) return;

    setResuming(true);
    setResumeError(null);

    try {
      const token = getAuthTokenFromDocument();

      // 1. Find tasks that are in_progress for this agent
      const tasksRes = await listAgentTasks(
        { company_id: companyId, status: 'in_progress' },
        token
      );
      const inProgressTasks = tasksRes.data.items;

      if (!inProgressTasks.length) {
        setResumeError('No active tasks in progress. Start a task to track it.');
        return;
      }

      // Take the most recent in-progress task (first in list)
      const task = inProgressTasks[0];
      const taskId = Number(task.id);

      // 2. Fetch full route history + current location snapshot in parallel
      const [routeRes, snapshotRes] = await Promise.allSettled([
        getTaskRoute(taskId, { company_id: companyId, role: 'agent', include_points: true }, token),
        listAgentLocations(
          { company_id: companyId, user_id: user.id, task_id: taskId, include_offline: true },
          token
        ),
      ]);

      // 3. Hydrate store with the full polyline history so the trail is visible
      if (routeRes.status === 'fulfilled') {
        hydrateFromRoute(taskId, routeRes.value.data, task);
      }

      // 4. Overlay with the current position snapshot (most recent location)
      if (snapshotRes.status === 'fulfilled' && snapshotRes.value.data.items.length) {
        hydrateFromSnapshots(
          snapshotRes.value.data.items as unknown as AgentLocationSnapshotItem[]
        );
      }

      // 5. Set as the active task — this flips isTracking to true and renders AgentMapView.
      //    AgentMapView calls useTrackingWebSocket() which will subscribe to live WS events
      //    so new location updates will keep flowing onto the map in real-time.
      setActiveTrackingTask(taskId);
      setViewMode(true);
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
  }, [setActiveTrackingTask]);

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
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <button
            onClick={() => router.push('/agent/tasks')}
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-[#7EB5AE] text-white rounded-2xl text-[14px] font-bold shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90 transition-all"
          >
            <ClipboardList size={16} />
            View My Tasks
          </button>
          <button
            onClick={handleViewActiveTracking}
            disabled={resuming || !companyId}
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-white text-[#7EB5AE] border border-[#7EB5AE]/40 rounded-2xl text-[14px] font-bold hover:bg-[#7EB5AE]/5 transition-all disabled:opacity-50"
          >
            {resuming ? (
              <span className="w-4 h-4 border-2 border-[#7EB5AE] border-t-transparent rounded-full animate-spin" />
            ) : (
              <Radio size={16} />
            )}
            {resuming ? 'Loading…' : 'View Active Tracking'}
          </button>
        </div>
        {resumeError && (
          <p className="text-[12px] text-red-400 max-w-xs">{resumeError}</p>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Task banner */}
      {activeTask && (
        <div className="absolute top-3 left-3 right-3 z-10 bg-white/90 backdrop-blur-sm rounded-2xl shadow px-4 py-2.5 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${viewMode ? 'bg-blue-400' : 'bg-red-400'}`} />
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${viewMode ? 'bg-blue-500' : 'bg-red-500'}`} />
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
      <AgentMapView />
    </div>
  );
}
