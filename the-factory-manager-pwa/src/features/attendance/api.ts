/**
 * Management Attendance API (`/admin/attendance/*`)
 */
import { client } from '@/lib/api/client';
import type { ClockInPayload, TodayAttendance } from './types';

function unwrap<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in raw) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

export type AttendanceMetrics = {
  date?: string;
  total_workforce: number;
  present: number;
  late: number;
  absent: number;
  auto_clocked?: number;
  attendance_percentage: number;
};

export type AttendanceRecord = {
  id: number | string;
  user_id: number;
  agent_name?: string;
  user_name?: string;
  email?: string;
  user_email?: string;
  role?: string;
  avatar_url?: string | null;
  date: string;
  status: 'present' | 'late' | 'absent' | 'excused' | string;
  clock_state?: 'clocked_in' | 'clocked_out' | 'not_clocked_in' | string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  hours_worked?: number | null;
  duration_minutes?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  clock_in_latitude?: number | null;
  clock_in_longitude?: number | null;
  clock_in_address?: string | null;
  auto_clocked_out?: boolean;
};

export type AttendanceSettings = {
  opening_time: string;
  closing_time: string;
  work_start_time?: string;
  work_end_time?: string;
  late_grace_minutes?: number;
  clock_in_window_minutes?: number;
  grace_period_minutes?: number;
  working_days?: string[];
  auto_clock_out_enabled?: boolean;
};

export type AttendanceMapSnapshot = {
  id: number | string;
  user_id: number;
  agent_name: string;
  user_name?: string;
  avatar_url?: string | null;
  status: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  latitude: number;
  longitude: number;
  address?: string | null;
};

export const attendanceApi = {
  async getMetrics(params?: { date?: string }): Promise<AttendanceMetrics> {
    const { data } = await client.get('/admin/attendance/metrics', { params });
    const raw = unwrap<Record<string, unknown>>(data);
    return {
      date: (raw?.date as string) ?? undefined,
      total_workforce: Number(raw?.total_workforce ?? raw?.total ?? 0),
      present: Number(raw?.present ?? raw?.present_count ?? 0),
      late: Number(raw?.late ?? raw?.late_count ?? 0),
      absent: Number(raw?.absent ?? raw?.absent_count ?? 0),
      auto_clocked: Number(raw?.auto_clocked ?? 0),
      attendance_percentage: Number(raw?.attendance_percentage ?? raw?.rate ?? 0),
    };
  },

  async getRecords(params?: {
    date?: string;
    status?: string;
    role?: string;
    clock_state?: string;
    search?: string;
    page?: number;
    per_page?: number;
  }): Promise<{ records: AttendanceRecord[]; total: number }> {
    const { data } = await client.get('/admin/attendance/records', { params });
    const raw = unwrap< unknown >(data);
    if (Array.isArray(raw)) {
      return { records: raw as AttendanceRecord[], total: raw.length };
    }
    const obj = (raw ?? {}) as Record<string, unknown>;
    const list = (obj.records ?? obj.data ?? obj.items ?? []) as AttendanceRecord[];
    const meta = (obj.meta ?? obj.pagination ?? {}) as Record<string, unknown>;
    return {
      records: Array.isArray(list) ? list : [],
      total: Number(meta.total ?? obj.total ?? list.length ?? 0),
    };
  },

  async getAgentHistory(
    agentId: number | string,
    params?: { from?: string; to?: string; page?: number; per_page?: number },
  ): Promise<{ records: AttendanceRecord[]; summary?: Record<string, unknown> }> {
    const { data } = await client.get(`/admin/attendance/agents/${agentId}/history`, { params });
    const raw = unwrap<Record<string, unknown>>(data);
    const list = (raw?.records ?? raw?.history ?? raw?.data ?? (Array.isArray(raw) ? raw : [])) as AttendanceRecord[];
    return {
      records: Array.isArray(list) ? list : [],
      summary: (raw?.summary as Record<string, unknown>) ?? undefined,
    };
  },

  async getSettings(): Promise<AttendanceSettings> {
    const { data } = await client.get('/admin/attendance/settings');
    return unwrap<AttendanceSettings>(data);
  },

  async updateSettings(payload: Partial<AttendanceSettings>): Promise<AttendanceSettings> {
    const { data } = await client.put('/admin/attendance/settings', payload);
    return unwrap<AttendanceSettings>(data);
  },

  async getMapSnapshots(params?: { date?: string }): Promise<AttendanceMapSnapshot[]> {
    const { data } = await client.get('/admin/attendance/map-snapshots', { params });
    const raw = unwrap<unknown>(data);
    if (Array.isArray(raw)) return raw as AttendanceMapSnapshot[];
    const obj = (raw ?? {}) as Record<string, unknown>;
    return ((obj.snapshots ?? obj.data ?? []) as AttendanceMapSnapshot[]);
  },

  async getPayrollSummaries(params?: { month?: string; year?: number }): Promise<unknown[]> {
    const { data } = await client.get('/admin/attendance/payroll-summaries', { params });
    const raw = unwrap<unknown>(data);
    return Array.isArray(raw) ? raw : ((raw as { summaries?: unknown[] })?.summaries ?? []);
  },

  async generatePayrollSummaries(payload?: { month?: string; start_date?: string; end_date?: string }): Promise<unknown> {
    const { data } = await client.post('/admin/attendance/payroll-summaries/generate', payload ?? {});
    return unwrap(data);
  },

  // Compatibility helpers so any legacy callers resolve cleanly
  async getToday(): Promise<TodayAttendance> {
    const metrics = await attendanceApi.getMetrics();
    return {
      date: metrics.date ?? new Date().toISOString().slice(0, 10),
      status: metrics.present > 0 ? 'present' : null,
      isClockedIn: metrics.present > 0,
      clockInAt: null,
      clockOutAt: null,
      isLate: false,
      workDurationMinutes: null,
      workingDay: true,
      canClockIn: false,
      canClockOut: false,
    };
  },

  async clockIn(_payload: ClockInPayload): Promise<TodayAttendance> {
    return attendanceApi.getToday();
  },

  async clockOut(_payload: ClockInPayload): Promise<TodayAttendance> {
    return attendanceApi.getToday();
  },
};
