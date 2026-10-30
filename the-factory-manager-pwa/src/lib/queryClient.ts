/**
 * TanStack Query client configuration.
 * Mirrors mobile app defaults — critical for field use (refetchOnReconnect).
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 2, // 2 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: true, // Critical for field use
    },
  },
});
