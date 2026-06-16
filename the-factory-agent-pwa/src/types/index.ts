/**
 * Global TypeScript types — shared across all features.
 */

export type ApiError = {
  status: number;
  message: string;
  code?: string;
  errors?: Record<string, string[]>;
};
