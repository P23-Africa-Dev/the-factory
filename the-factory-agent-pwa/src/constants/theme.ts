/**
 * Theme tokens — direct port from mobile app.
 * CSS-compatible units (px strings for use in inline styles / CSS vars).
 */

export const colors = {
  primary: '#000000',
  background: '#F5F5F5',
  surface: '#FFFFFF',
  error: '#E74C3C',
  warning: '#F39C12',
  success: '#27AE60',
  info: '#3498DB',
  textPrimary: '#1A1A1A',
  textSecondary: '#666666',
  textMuted: '#999999',
  border: '#E0E0E0',
  dashDark: '#0A1D25',
  dashCard: '#0B3343',
  dashAccent: '#7BB6B8',
  dashAccentAlt: '#75ADAF',
  notifBadge: '#FD6046',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 999,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const },
  h2: { fontSize: 22, fontWeight: '700' as const },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 16 },
  caption: { fontSize: 13 },
  label: { fontSize: 12, fontWeight: '600' as const },
} as const;
