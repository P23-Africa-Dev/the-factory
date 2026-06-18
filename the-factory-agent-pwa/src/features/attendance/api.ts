import { client } from '@/lib/api/client';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { queueOfflineAction } from '@/lib/offline/queue';
import { clockEventSchema, todayAttendanceSchema } from './schema';
import type { ClockEvent, ClockInPayload, TodayAttendance } from './types';

function unwrapItem(raw: unknown): unknown {
  const wrapped = raw as Record<string, unknown>;
  if (wrapped?.data === undefined) return raw;
  return wrapped.data;
}

export const attendanceApi = {
  clockIn: async (payload: ClockInPayload): Promise<ClockEvent> => {
    const companyId = getActiveCompanyId();
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await queueOfflineAction({
        actionType: 'attendance.clock_in',
        payload: { company_id: companyId ?? undefined, ...payload },
        companyId,
      });
      return {
        record: {
          id: `offline-clock-in-${Date.now()}`,
          clock_in_at: payload.timestamp,
          clock_out_at: null,
        },
      };
    }

    const response = await client.post('/agent/attendance/clock-in', {
      company_id: companyId ?? undefined,
      ...payload,
    });
    return clockEventSchema.parse(unwrapItem(response.data));
  },

  clockOut: async (payload: ClockInPayload): Promise<ClockEvent> => {
    const companyId = getActiveCompanyId();
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await queueOfflineAction({
        actionType: 'attendance.clock_out',
        payload: { company_id: companyId ?? undefined, ...payload },
        companyId,
      });
      return {
        record: {
          id: `offline-clock-out-${Date.now()}`,
          clock_in_at: null,
          clock_out_at: payload.timestamp,
        },
      };
    }

    const response = await client.post('/agent/attendance/clock-out', {
      company_id: companyId ?? undefined,
      ...payload,
    });
    return clockEventSchema.parse(unwrapItem(response.data));
  },

  getToday: async (): Promise<TodayAttendance> => {
    const companyId = getActiveCompanyId();
    const response = await client.get('/agent/attendance/today', {
      params: { company_id: companyId ?? undefined },
    });
    return todayAttendanceSchema.parse(unwrapItem(response.data));
  },
};
