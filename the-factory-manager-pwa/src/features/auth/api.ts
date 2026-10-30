/**
 * Auth API for Factory 23 Manager PWA (Owners, Admins, Supervisors).
 */
import { client } from '@/lib/api/client';
import type {
  LoginPayload,
  LoginResponse,
  ForgotPasswordPayload,
  ForgotPasswordResponse,
  ResetPasswordPayload,
  ResetPasswordResponse,
  Profile,
} from './types';

function unwrap<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in raw) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

export type CompanySettingsData = {
  company?: {
    id?: number;
    name?: string;
    industry?: string | null;
    size?: string | null;
    timezone?: string | null;
    country?: string | null;
  };
  settings?: {
    user_management?: {
      supervisor_can_suspend_agents?: boolean;
      supervisor_can_delete_agents?: boolean;
    };
    payroll?: {
      admin_can_access_payroll?: boolean;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export const authApi = {
  async login(payload: LoginPayload): Promise<LoginResponse> {
    const { data } = await client.post('/auth/login', payload);
    return unwrap<LoginResponse>(data);
  },

  async forgotPassword(
    payload: ForgotPasswordPayload & { portal?: string },
  ): Promise<ForgotPasswordResponse> {
    const { data } = await client.post<ForgotPasswordResponse>('/auth/forgot-password', {
      ...payload,
      portal: payload.portal ?? 'management',
    });
    return data;
  },

  async validateResetToken(
    token: string,
    params: { email: string; portal?: string },
  ): Promise<{ success: boolean; message: string; data: { valid: boolean } }> {
    const { data } = await client.get(`/auth/reset-password/${token}`, {
      params: {
        ...params,
        portal: params.portal ?? 'management',
      },
    });
    return data;
  },

  async resetPassword(
    payload: ResetPasswordPayload & { portal?: string },
  ): Promise<ResetPasswordResponse> {
    const { data } = await client.post<ResetPasswordResponse>('/auth/reset-password', {
      ...payload,
      portal: payload.portal ?? 'management',
    });
    return data;
  },

  async logout(): Promise<void> {
    await client.post('/auth/logout');
  },

  async getProfile(): Promise<Profile> {
    const { data } = await client.get('/user/profile');
    return unwrap<Profile>(data);
  },

  async getMe(): Promise<Record<string, unknown>> {
    const { data } = await client.get('/user/me');
    return unwrap<Record<string, unknown>>(data);
  },

  async updateProfile(payload: {
    name?: string;
    first_name?: string;
    last_name?: string;
    phone?: string | null;
    timezone?: string | null;
    locale?: string | null;
    password?: string;
    password_confirmation?: string;
  }): Promise<Profile> {
    const { data } = await client.patch('/user/profile', payload);
    return unwrap<Profile>(data);
  },

  async uploadAvatar(file: File): Promise<{ avatar_url: string; avatar_updated_at?: string }> {
    const form = new FormData();
    form.append('avatar', file);
    const { data } = await client.post('/user/profile/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap<{ avatar_url: string; avatar_updated_at?: string }>(data);
  },

  async getCompanySettings(): Promise<CompanySettingsData> {
    const { data } = await client.get('/company/settings');
    return unwrap<CompanySettingsData>(data);
  },

  async updateCompanySettings(payload: Record<string, unknown>): Promise<CompanySettingsData> {
    const { data } = await client.patch('/company/settings', payload);
    return unwrap<CompanySettingsData>(data);
  },
};
