import { client } from '@/lib/api/client';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { readSession } from '@/session/sessionStore';

/**
 * The trip's route as the server has it ([lng, lat], oldest first, downsampled).
 * Lets the live map show the whole trip after a reinstall, on another phone, or
 * when the phone only kept the latest points.
 */
export async function fetchTripRoute(serverId: number): Promise<[number, number][]> {
  const manager = readSession()?.app_mode === 'manager';
  const path = manager ? `/admin/field-activity/journeys/${serverId}` : `/agent/field-activity/journeys/${serverId}`;
  const res = await client.get(path, {
    params: { company_id: getActiveCompanyId() ?? undefined, include_route: true, include_timeline: false },
    suppressErrorToast: true,
  });
  const body = res.data as { data?: { route?: { coordinates?: unknown } } };
  const coords = body?.data?.route?.coordinates;
  if (!Array.isArray(coords)) return [];
  return coords.filter(
    (c): c is [number, number] =>
      Array.isArray(c) && c.length >= 2 && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1])),
  ).map((c) => [Number(c[0]), Number(c[1])]);
}

/**
 * Server route first, then the phone's newer points (those after the point of
 * the phone's trail closest to the server route's end).
 */
export function mergeTrails(server: [number, number][], local: [number, number][]): [number, number][] {
  if (server.length === 0) return local;
  if (local.length === 0) return server;
  const end = server[server.length - 1] as [number, number];
  let best = -1;
  let bestD = Infinity;
  local.forEach(([x, y], i) => {
    const d = (x - end[0]) ** 2 + (y - end[1]) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  // ~200 m in degrees²: the phone's trail does not reach the server route's end.
  if (bestD > 0.0018 ** 2) return local.length >= server.length ? local : server;
  return [...server, ...local.slice(best + 1)];
}
