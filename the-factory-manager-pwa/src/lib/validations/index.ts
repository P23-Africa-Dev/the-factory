/**
 * Shared Zod validation schemas.
 * Port of mobile app's lib/validations/index.ts
 */
import { z } from 'zod';

export const emailSchema = z.string().email('Please enter a valid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters');
