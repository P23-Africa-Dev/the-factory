export { useGeolocation } from './hooks/useGeolocation';
export type { PermissionStatus, LocationObject } from './hooks/useGeolocation';
export { useLocationPermissionBootstrap } from './hooks/useLocationPermissionBootstrap';
export { useMapPresenceHeartbeat } from './hooks/useMapPresenceHeartbeat';
export { useLocationReporter } from './hooks/useLocationReporter';
export { useProximityWatch } from './hooks/useProximityWatch';
export { useTaskRoute, useStartTask } from './queries';
export { useTrackingNavigation } from './navigation';
export { ActiveTrackingProvider, useActiveTracking } from './ActiveTrackingProvider';
export { getApiErrorMessage, startMapTaskSession } from './lib/startMapTaskSession';
export type { StartMapTaskSessionResult } from './lib/startMapTaskSession';
export { buildCompleteFormData } from './completeTaskForm';
export { hydrateLiveTaskFromRoute } from './hydrateRoute';
export { trackingApi } from './api';
export { trackingKeys } from './queryKeys';
export { LocationPermissionGate } from './components/LocationPermissionGate';
export type { LocationPermissionGateProps } from './components/LocationPermissionGate';

export type {
  TrackingSession,
  LocationPoint,
  TaskRoute,
  TrackingStatus,
  ActiveTrackingSession,
  StartTaskPayload,
  RecordLocationPayload,
} from './types';
