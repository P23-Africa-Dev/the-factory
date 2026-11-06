/**
 * Auth types — inferred from Zod schemas and unified mobile login.
 */
import type { z } from 'zod';
import type { loginPayloadSchema, forgotPasswordPayloadSchema, resetPasswordPayloadSchema, profileSchema } from './schema';
import type { AppMode, ManagerRole } from '@/session/appMode';

export type { AppMode, ManagerRole };

export type LoginPayload = z.infer<typeof loginPayloadSchema>;
export type ForgotPasswordPayload = z.infer<typeof forgotPasswordPayloadSchema>;
export type ResetPasswordPayload = z.infer<typeof resetPasswordPayloadSchema>;

export type UserCompany = {
  id: number;
  company_id?: string;
  name: string;
  role: string;
};

export type LoginResponse = {
  token: string;
  app_mode?: AppMode;
  home_path?: string;
  access_role?: string;
  internal_role?: string;
  user_type?: string;
  companies?: UserCompany[];
  user?: {
    id: number;
    name: string;
    email: string;
    company_id?: number;
    avatar_url?: string | null;
    avatar?: string | null;
    internal_role?: string;
    user_type?: string;
    companies?: UserCompany[];
  };
};

export type MobileLoginResponse = LoginResponse;

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
