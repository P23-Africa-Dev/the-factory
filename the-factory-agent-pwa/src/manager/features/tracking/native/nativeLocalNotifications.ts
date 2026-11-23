/**
 * Shared with the agent shell so only one set of native listeners is ever attached
 * (two copies used to register duplicate tap handlers).
 */
export * from '@/features/tracking/native/nativeLocalNotifications';
