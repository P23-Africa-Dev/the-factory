import { z } from 'zod';

export const clockEventSchema = z.object({
  record: z.object({
    id: z.union([z.number(), z.string()]),
    clock_in_at: z.string().nullable().optional(),
    clock_out_at: z.string().nullable().optional(),
  }).passthrough(),
});

// Caller-facing shape
export const clockInPayloadSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  recorded_at: z.string(),
});

const attendanceRecordSchema = z
  .object({
    clock_in_at: z.string().nullable(),
    clock_out_at: z.string().nullable(),
    status: z.string().nullable(),
    work_duration_minutes: z.number().nullable(),
    is_late: z.boolean(),
  })
  .nullable();

// Confirmed shape from `GET /agent/attendance/today`
export const todayAttendanceSchema = z
  .object({
    attendance_date: z.string(),
    working_day: z.boolean(),
    can_clock_in: z.boolean(),
    can_clock_out: z.boolean(),
    status: z.string().nullable().optional(),
    record: attendanceRecordSchema.optional(),
  })
  .transform((raw) => {
    const record = raw.record ?? null;
    const clockInAt = record?.clock_in_at ?? null;
    const clockOutAt = record?.clock_out_at ?? null;

    return {
      date: raw.attendance_date,
      status: record?.status ?? raw.status ?? null,
      clockInAt,
      clockOutAt,
      isLate: record?.is_late ?? false,
      workDurationMinutes: record?.work_duration_minutes ?? null,
      workingDay: raw.working_day,
      canClockIn: raw.can_clock_in,
      canClockOut: raw.can_clock_out,
      isClockedIn: Boolean(clockInAt) && !clockOutAt,
    };
  });
