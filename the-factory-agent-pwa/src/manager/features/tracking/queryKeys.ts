export const trackingKeys = {
  all: ['manager', 'tracking'] as const,
  route: (taskId: number) => [...trackingKeys.all, 'route', taskId] as const,
  session: (taskId: number) => [...trackingKeys.all, 'session', taskId] as const,
};
