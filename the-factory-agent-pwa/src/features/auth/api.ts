/**
 * Auth API functions — ported from mobile app.
 * Typed Axios calls for agent authentication endpoints.
 */
import { client } from '@/lib/api/client';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { profileSchema } from './schema';
import type { Profile, LoginResponse } from './types';

export type LoginPayload = {
  email: string;
  password: string;
};

export type ForgotPasswordPayload = {
  email: string;
  portal?: 'management' | 'agent';
};

export type ForgotPasswordResponse = {
  success: boolean;
  message: string;
  data: null;
};

export type ResetPasswordPayload = {
  email: string;
  token: string;
  password: string;
  password_confirmation: string;
  portal?: 'management' | 'agent';
};

export type ResetPasswordResponse = {
  success: boolean;
  message: string;
  data: null;
};

export type ValidateResetTokenResponse = {
  success: boolean;
  message: string;
  data: {
    valid: boolean;
  };
};

function normalizeProfileBody(body: Record<string, unknown>): Record<string, unknown> {
  if (body.identity && typeof body.identity === 'object') {
    return body; // Already nested — pass through
  }
  return {
    identity: {
      id: body.id,
      name: body.name,
      email: body.email,
      phone: body.phone,
      gender: body.gender,
      avatar_url: body.avatar_url ?? body.avatar,
    },
    organization: {
      company_name: body.company_name,
      company_code: body.company_code,
      company_id: body.company_id,
      role: body.role,
      membership: body.membership,
      team_size: body.team_size,
      country: body.country,
      purpose: body.purpose,
      joined_at: body.joined_at ?? body.created_at,
    },
    account: {
      status: body.status,
      email_verified: body.email_verified,
      onboarding_type: body.onboarding_type,
      joined_at: body.joined_at ?? body.created_at,
      updated_at: body.updated_at,
    },
    permissions: {
      access_role: body.access_role,
      internal_role: body.internal_role,
      roles: Array.isArray(body.roles) ? body.roles : [],
    },
  };
}

export const authApi = {
  login: (payload: LoginPayload): Promise<LoginResponse> =>
    client.post('/agent/login', payload).then((r) => {
      const body = r.data as Record<string, unknown>;
      const data = (body.data && typeof body.data === 'object' ? body.data : body) as Record<string, unknown>;
      const user = data.user as LoginResponse['user'];
      return {
        token: String(data.token ?? ''),
        access_role: data.access_role != null ? String(data.access_role) : undefined,
        internal_role: data.internal_role != null ? String(data.internal_role) : undefined,
        user,
      };
    }),

  logout: (): Promise<{ success: boolean }> =>
    client.post('/auth/logout').then((r) => r.data),

  forgotPassword: (payload: ForgotPasswordPayload): Promise<ForgotPasswordResponse> =>
    client
      .post<ForgotPasswordResponse>('/auth/forgot-password', {
        ...payload,
        portal: payload.portal ?? 'agent',
      })
      .then((r) => r.data),

  validateResetToken: (
    token: string,
    params: { email: string; portal?: 'management' | 'agent' },
  ): Promise<ValidateResetTokenResponse> => {
    const qs = new URLSearchParams();
    qs.set('email', params.email);
    if (params.portal) qs.set('portal', params.portal);
    return client
      .get<ValidateResetTokenResponse>(
        `/auth/reset-password/${encodeURIComponent(token)}?${qs.toString()}`,
      )
      .then((r) => r.data);
  },

  resetPassword: (payload: ResetPasswordPayload): Promise<ResetPasswordResponse> =>
    client
      .post<ResetPasswordResponse>('/auth/reset-password', {
        ...payload,
        portal: payload.portal ?? 'agent',
      })
      .then((r) => r.data),

  getProfile: async (companyId?: number | string | null): Promise<Profile> => {
    const id = companyId ?? getActiveCompanyId();
    const qs = id != null ? `?company_id=${encodeURIComponent(String(id))}` : '';
    const res = await client.get(`/user/profile${qs}`);
    const raw = res.data as Record<string, unknown>;
    const body = (raw?.data && typeof raw.data === 'object' ? raw.data : raw) as Record<string, unknown>;
    const normalized = normalizeProfileBody(body);
    return profileSchema.parse(normalized);
  },
};
