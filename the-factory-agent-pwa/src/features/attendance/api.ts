import { client } from '@/lib/api/client';
import { getActiveCompanyId } from '@/lib/storage/stores';
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
    const response = await client.post('/agent/attendance/clock-in', {
      company_id: companyId ?? undefined,
      ...payload,
    });
    return clockEventSchema.parse(unwrapItem(response.data));
  },

  clockOut: async (payload: ClockInPayload): Promise<ClockEvent> => {
    const companyId = getActiveCompanyId();
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
