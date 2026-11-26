/**
 * Managers track their own tasks with exactly the same code as agents (one
 * tracker, one upload path, the role-neutral /tasks/{id}/… endpoints). Only
 * navigation (manager routes) and the fleet / territory APIs are manager-only.
 */
export {
  useGeolocation,
  useLocationPermissionBootstrap,
  useLocationReporter,
  useProximityWatch,
  useStartTask,
  ActiveTrackingProvider,
  useActiveTracking,
  getApiErrorMessage,
  startMapTaskSession,
  buildCompleteFormData,
  resolveCompletionRequirements,
  validateCompletionRequirements,
} from '@/features/tracking';
export type {
  PermissionStatus,
  LocationObject,
  StartMapTaskSessionResult,
  CompletionRequirements,
} from '@/features/tracking';
export { useTrackingNavigation } from './navigation';
// Manager-only: any task's route (admin endpoint, fleet map) and no agent
// presence heartbeat for managers.
export { useTaskRoute } from './queries';
export { useMapPresenceHeartbeat } from './hooks/useMapPresenceHeartbeat';
export { CompleteRequirementsSheet } from './components/CompleteRequirementsSheet';
export type { CompleteRequirementsSheetProps } from './components/CompleteRequirementsSheet';
export { hydrateLiveTaskFromRoute } from './hydrateRoute';
export {
  trackingApi,
  useFleetAgentLocations,
  useTrackingHealth,
  useTerritories,
} from './api';
export type { FleetAgentLocation, TerritoryItem } from './api';
export { trackingKeys } from './queryKeys';
export { LocationPermissionGate } from './components/LocationPermissionGate';
export type { LocationPermissionGateProps } from './components/LocationPermissionGate';
export { isNativeAndroid, isNativePlatform } from './native/capacitorPlatform';

export type {
  TrackingSession,
  LocationPoint,
  TaskRoute,
  TrackingStatus,
  ActiveTrackingSession,
  StartTaskPayload,
  RecordLocationPayload,
} from './types';
