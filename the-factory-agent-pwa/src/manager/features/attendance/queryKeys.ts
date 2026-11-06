export const attendanceKeys = {
  all: ['manager', 'attendance'] as const,
  today: () => [...attendanceKeys.all, 'today'] as const,
};
