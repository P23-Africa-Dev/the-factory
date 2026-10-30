/**
 * Auth navigation — replaces expo-router with next/navigation.
 */
'use client';

import { useRouter } from 'next/navigation';

export const useAuthNavigation = () => {
  const router = useRouter();

  return {
    goToLogin: () => router.push('/login'),
    goToForgotPassword: () => router.push('/forgot-password'),
    goToResetPassword: (token: string) =>
      router.push(`/reset-password/${encodeURIComponent(token)}`),
    goToProfile: () => router.push('/profile'),
    goToAgentHome: () => router.push('/'),
    goBack: () => router.back(),
  };
};
