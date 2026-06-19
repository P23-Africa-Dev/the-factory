/**
 * Auth types — inferred from Zod schemas.
 */
import type { z } from 'zod';
import type { loginPayloadSchema, forgotPasswordPayloadSchema, resetPasswordPayloadSchema, profileSchema } from './schema';

export type LoginPayload = z.infer<typeof loginPayloadSchema>;
export type ForgotPasswordPayload = z.infer<typeof forgotPasswordPayloadSchema>;
export type ResetPasswordPayload = z.infer<typeof resetPasswordPayloadSchema>;

export type LoginResponse = {
  token: string;
  access_role?: string;
  internal_role?: string;
  user?: {
    id: number;
    name: string;
    email: string;
    company_id?: number;
    avatar_url?: string | null;
    avatar?: string | null;
  };
};


export type ForgotPasswordResponse = {
  success: boolean;
  message: string;
  data: null;
};

export type ResetPasswordResponse = {
  success: boolean;
  message: string;
  data: null;
};

export type Profile = z.infer<typeof profileSchema>;

