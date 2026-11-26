'use client';

import { useCallback } from 'react';
import { toast } from '@/lib/toast';
import { useOptionalFieldTrip } from './FieldTripProvider';

/**
 * Logging out wipes this phone's session, so a running field trip is ended and
 * uploaded first. Resolves true when it is safe to log out.
 */
export function useEndTripBeforeLogout(): {
  onTrip: boolean;
  prepareLogout: (options?: { confirm?: boolean }) => Promise<boolean>;
} {
  const fieldTrip = useOptionalFieldTrip();
  const onTrip = fieldTrip?.local != null;

  const prepareLogout = useCallback(
    async ({ confirm = true }: { confirm?: boolean } = {}): Promise<boolean> => {
      if (!fieldTrip?.local) return true;
      if (
        confirm &&
        typeof window !== 'undefined' &&
        !window.confirm('You are on a field trip. Logging out ends the trip and saves your route. Continue?')
      ) {
        return false;
      }
      const ended = await fieldTrip.endTrip(null);
      if (ended) return true;
      toast.error(
        'Trip not saved yet',
        'Your route is still uploading. Connect to the internet, then log out again.',
      );
      return false;
    },
    [fieldTrip],
  );

  return { onTrip, prepareLogout };
}
