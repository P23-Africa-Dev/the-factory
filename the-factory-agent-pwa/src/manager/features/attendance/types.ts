import type { z } from 'zod';
import type {
  clockEventSchema,
  clockInPayloadSchema,
  todayAttendanceSchema,
} from './schema';

export type ClockEvent = z.infer<typeof clockEventSchema>;
export type ClockInPayload = z.infer<typeof clockInPayloadSchema>;
export type TodayAttendance = z.infer<typeof todayAttendanceSchema>;
