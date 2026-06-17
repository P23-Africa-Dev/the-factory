/**
 * Auth TanStack Query hooks — ported from mobile.
 */
'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { authApi } from './api';
import { authKeys } from './queryKeys';
import type { LoginPayload, ForgotPasswordPayload, ResetPasswordPayload } from './types';

export function useLoginMutation() {
  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),
  });
}

export function useForgotPasswordMutation() {
  return useMutation({
    mutationFn: (payload: ForgotPasswordPayload) =>
      authApi.forgotPassword({ ...payload, portal: 'agent' }),
  });
}

export function useValidateResetTokenQuery(
  token: string,
  email: string,
  enabled: boolean = true,
) {
  return useQuery({
    queryKey: [...authKeys.all, 'validate-token', token, email],
    queryFn: () => authApi.validateResetToken(token, { email, portal: 'agent' }),
    enabled,
    retry: false,
  });
}

export function useResetPasswordMutation() {
  return useMutation({
    mutationFn: (payload: ResetPasswordPayload) =>
      authApi.resetPassword({ ...payload, portal: 'agent' }),
  });
}

export function useLogoutMutation() {
  return useMutation({
    mutationFn: () => authApi.logout(),
  });
}

export function useProfile(enabled: boolean = true) {
  return useQuery({
    queryKey: authKeys.profile(),
    queryFn: () => authApi.getProfile(),
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
