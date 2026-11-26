"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { getActiveCompanyContext } from "@/lib/company-context";
import {
  getFieldActivityLive,
  type FieldActivityLiveAgentDto,
} from "@/lib/api/field-activity";
import { useAuthStore } from "@/store/auth";
import {
  useFieldActivityLiveStore,
  type FieldActivityLiveAgent,
} from "@/store/field-activity-live";
import { useTrackingStore } from "@/store/tracking";
import { getSafeAvatarSrc } from "@/lib/avatar";

function toLngLat(lat: unknown, lng: unknown): [number, number] | null {
  const la = typeof lat === "string" ? Number.parseFloat(lat) : lat;
  const ln = typeof lng === "string" ? Number.parseFloat(lng) : lng;
  if (typeof la !== "number" || typeof ln !== "number") return null;
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  return [ln, la];
}

export function mapLiveAgentDto(dto: FieldActivityLiveAgentDto): FieldActivityLiveAgent {
  const polyline = (dto.route?.coordinates ?? []) as [number, number][];
  const metaStart = dto.session.meta?.start;
  return {
    userId: dto.user_id,
    name: dto.name,
    avatarUrl: getSafeAvatarSrc(dto.avatar_url),
    sessionId: dto.session.id,
    lastPosition: toLngLat(dto.last_latitude, dto.last_longitude),
    lastMovementState: dto.last_movement_state,
    lastRecordedAt: dto.last_recorded_at,
    polyline,
    stops: (dto.stops ?? []).map((stop) => ({
      id: stop.id,
      field_activity_session_id: stop.field_activity_session_id,
      latitude: stop.latitude,
      longitude: stop.longitude,
      address: stop.address,
      duration_seconds: stop.duration_seconds,
      classification: stop.classification,
      arrived_at: stop.arrived_at,
      departed_at: stop.departed_at,
    })),
    startedAt: dto.session.started_at ?? null,
    // The server route is downsampled but always keeps its first point.
    startPosition: (metaStart ? toLngLat(metaStart.latitude, metaStart.longitude) : null) ?? polyline[0] ?? null,
    distanceMeters:
      typeof dto.session.distance_meters === "number" ? dto.session.distance_meters : null,
    endedAt: null,
  };
}

export const fieldActivityLiveQueryKey = (companyId: number | string | null | undefined) =>
  ["field-activity", "live", companyId] as const;

export function useFieldActivityLiveHydrate(enabled = true) {
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId } = getActiveCompanyContext(user);
  const hydrate = useFieldActivityLiveStore((s) => s.hydrate);
  const refreshNonce = useFieldActivityLiveStore((s) => s.refreshNonce);
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const wsStatus = useTrackingStore((s) => s.wsStatus);
  // Field activity points also arrive over WS — poll only when disconnected.
  const refetchInterval = wsStatus === "connected" ? false : 60_000;

  const query = useQuery({
    queryKey: fieldActivityLiveQueryKey(apiCompanyId),
    enabled: enabled && !!apiCompanyId && !!token,
    queryFn: async () => {
      const fetchedAtMs = Date.now();
      const res = await getFieldActivityLive(
        { company_id: apiCompanyId ?? undefined },
        token,
      );
      return { ...res.data, fetchedAtMs };
    },
    refetchInterval,
    staleTime: 15_000,
  });

  // Realtime asked for a refresh (reconnect, tab visible again, unknown person).
  const { refetch } = query;
  const lastNonceRef = useRef(refreshNonce);
  useEffect(() => {
    if (!enabled || refreshNonce === lastNonceRef.current) return;
    lastNonceRef.current = refreshNonce;
    void refetch();
  }, [enabled, refreshNonce, refetch]);

  // A disabled caller (e.g. the compact home map) must not wipe the shared
  // store that the full map and the socket keep filling.
  useEffect(() => {
    if (!enabled || !query.data?.agents) return;
    hydrate(query.data.agents.map(mapLiveAgentDto), { fetchedAtMs: query.data.fetchedAtMs });
  }, [enabled, query.data, hydrate]);

  return query;
}
