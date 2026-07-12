import { describe, expect, it } from "vitest";

import {
  isActivelyOnTask,
  isHistoryFeedTask,
  resolveMapTasks,
  resolveTrajectoryTaskIds,
  shouldShowTrajectory,
  splitLiveFeedTasks,
  TRACKING_STALE_MS,
} from "@/lib/tracking/live-feed-groups";
import type { LiveTaskState } from "@/types/tracking";

const NOW = new Date("2026-07-12T12:00:00.000Z").getTime();

function task(overrides: Partial<LiveTaskState> & Pick<LiveTaskState, "taskId">): LiveTaskState {
  return {
    taskId: overrides.taskId,
    trackingSessionId: overrides.trackingSessionId ?? 1,
    userId: overrides.userId ?? 10,
    agentName: overrides.agentName ?? "Agent",
    taskTitle: "Task",
    status: overrides.status ?? "in_progress",
    lastPosition: overrides.lastPosition ?? [3.4, 6.5],
    polyline: [],
    lastEventAt: overrides.lastEventAt ?? "2026-07-12T11:59:00.000Z",
    movementStarted: overrides.movementStarted,
    operationalStatus: overrides.operationalStatus,
    isOnline: overrides.isOnline,
    etaSeconds: overrides.etaSeconds,
  };
}

describe("live-feed-groups", () => {
  it("treats in-progress fresh tasks as active", () => {
    const live = task({ taskId: 1, movementStarted: true, isOnline: true });
    expect(isActivelyOnTask(live, NOW, TRACKING_STALE_MS)).toBe(true);
    expect(isHistoryFeedTask(live, NOW, TRACKING_STALE_MS)).toBe(false);
  });

  it("routes completed tasks to history", () => {
    const done = task({ taskId: 2, status: "completed" });
    expect(isActivelyOnTask(done, NOW, TRACKING_STALE_MS)).toBe(false);
    expect(isHistoryFeedTask(done, NOW, TRACKING_STALE_MS)).toBe(true);
  });

  it("routes stale tasks to history", () => {
    const stale = task({
      taskId: 3,
      lastEventAt: "2026-07-12T11:50:00.000Z",
    });
    expect(isActivelyOnTask(stale, NOW, TRACKING_STALE_MS)).toBe(false);
    expect(isHistoryFeedTask(stale, NOW, TRACKING_STALE_MS)).toBe(true);
  });

  it("keeps delayed but actively tracking tasks in active feed", () => {
    const delayed = task({
      taskId: 4,
      etaSeconds: 3600,
      operationalStatus: "delayed",
      isOnline: true,
    });
    expect(isActivelyOnTask(delayed, NOW, TRACKING_STALE_MS)).toBe(true);
    expect(isHistoryFeedTask(delayed, NOW, TRACKING_STALE_MS)).toBe(false);
  });

  it("requires an open tracking session for active classification", () => {
    const noSession = task({ taskId: 5, trackingSessionId: 0 });
    expect(isActivelyOnTask(noSession, NOW, TRACKING_STALE_MS)).toBe(false);
  });

  it("routes backend-offline tasks to history", () => {
    const offline = task({
      taskId: 6,
      operationalStatus: "offline",
      isOnline: false,
    });
    expect(isActivelyOnTask(offline, NOW, TRACKING_STALE_MS)).toBe(false);
  });

  it("splitLiveFeedTasks sorts by lastEventAt desc", () => {
    const activeOld = task({
      taskId: 10,
      movementStarted: true,
      lastEventAt: "2026-07-12T11:58:00.000Z",
    });
    const activeNew = task({
      taskId: 11,
      movementStarted: true,
      lastEventAt: "2026-07-12T11:59:30.000Z",
    });
    const completed = task({ taskId: 12, status: "completed" });

    const { active, history } = splitLiveFeedTasks(
      [activeOld, completed, activeNew],
      NOW,
      TRACKING_STALE_MS,
    );
    expect(active.map((t) => t.taskId)).toEqual([11, 10]);
    expect(history.map((t) => t.taskId)).toEqual([12]);
  });

  it("shouldShowTrajectory gates by selection and follow-all", () => {
    const activeIds = new Set([1, 2]);
    expect(shouldShowTrajectory(1, null, false, activeIds)).toBe(false);
    expect(shouldShowTrajectory(1, 1, false, activeIds)).toBe(true);
    expect(shouldShowTrajectory(2, 1, false, activeIds)).toBe(false);
    expect(shouldShowTrajectory(1, null, true, activeIds)).toBe(true);
    expect(shouldShowTrajectory(2, null, true, activeIds)).toBe(true);
    expect(shouldShowTrajectory(99, null, true, activeIds)).toBe(false);
  });

  it("resolveMapTasks includes selected history agent on map", () => {
    const active = [task({ taskId: 1, movementStarted: true })];
    const history = [task({ taskId: 9, status: "completed" })];
    expect(resolveMapTasks(active, history, null).map((t) => t.taskId)).toEqual([1]);
    expect(resolveMapTasks(active, history, 9).map((t) => t.taskId)).toEqual([1, 9]);
  });

  it("resolveTrajectoryTaskIds matches follow-all and selection modes", () => {
    const active = [task({ taskId: 1 }), task({ taskId: 2 })];
    expect(Array.from(resolveTrajectoryTaskIds(active, null, false))).toEqual([]);
    expect(Array.from(resolveTrajectoryTaskIds(active, 2, false))).toEqual([2]);
    expect(Array.from(resolveTrajectoryTaskIds(active, null, true))).toEqual([1, 2]);
  });
});
