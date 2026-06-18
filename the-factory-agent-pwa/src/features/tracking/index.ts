export { useGeolocation } from './hooks/useGeolocation';
export { useLocationReporter } from './hooks/useLocationReporter';
export { useProximityWatch } from './hooks/useProximityWatch';
export { useTaskRoute, useStartTask } from './queries';
export { useTrackingNavigation } from './navigation';
export { ActiveTrackingProvider, useActiveTracking } from './ActiveTrackingProvider';
export { buildCompleteFormData } from './completeTaskForm';
export { hydrateLiveTaskFromRoute } from './hydrateRoute';
export { trackingApi } from './api';
export { trackingKeys } from './queryKeys';

export type {
  TrackingSession,
  LocationPoint,
  TaskRoute,
  TrackingStatus,
  ActiveTrackingSession,
  StartTaskPayload,
  RecordLocationPayload,
} from './types';
