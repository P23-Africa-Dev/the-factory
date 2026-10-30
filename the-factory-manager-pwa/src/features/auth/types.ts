/**
 * Auth types — inferred from Zod schemas + Manager RBAC fields.
 */
import type { z } from 'zod';
import type { loginPayloadSchema, forgotPasswordPayloadSchema, resetPasswordPayloadSchema, profileSchema } from './schema';

export type LoginPayload = z.infer<typeof loginPayloadSchema>;
export type ForgotPasswordPayload = z.infer<typeof forgotPasswordPayloadSchema>;
export type ResetPasswordPayload = z.infer<typeof resetPasswordPayloadSchema>;

export type ManagerRole = 'owner' | 'admin' | 'supervisor';

export type LoginResponse = {
  token: string;
  access_role?: string | null;
  internal_role?: string | null;
  user_type?: string | null;
  onboarding_completed?: boolean;
  user?: {
    id: number;
    name: string;
    email: string;
    company_id?: number | null;
    internal_role?: string | null;
    user_type?: string | null;
    avatar_url?: string | null;
    avatar?: string | null;
    companies?: Array<{
      id: number;
      name?: string;
      pivot?: { role?: string };
    }>;
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
