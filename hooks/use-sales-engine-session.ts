"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ensureSalesEngineSession,
  SalesEngineApiError,
} from "@/lib/api/sales-engine";
import { getSalesEngineToken } from "@/lib/sales-engine/session";
import { useAuthStore } from "@/store/auth";

type SalesEngineSessionState = {
  ready: boolean;
  loading: boolean;
  error: string | null;
  bootstrap: () => Promise<void>;
};

export function useSalesEngineSession(): SalesEngineSessionState {
  const hasHydrated = useAuthStore((state) => state._hasHydrated);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!getSalesEngineToken()) {
        await ensureSalesEngineSession();
      }
      setReady(true);
    } catch (err) {
      setReady(false);
      setError(
        err instanceof SalesEngineApiError
          ? err.message
          : "Could not connect to Sales Engine."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    bootstrap();
  }, [hasHydrated, bootstrap]);

  return { ready, loading, error, bootstrap };
}
