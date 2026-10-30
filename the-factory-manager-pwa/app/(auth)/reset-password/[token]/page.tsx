'use client';

import React, { useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';

import { useValidateResetTokenQuery, useResetPasswordMutation } from '@/features/auth';
import { Input } from '@/components/ui/Input';

const resetFormSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Za-z]/, 'Password must contain at least one letter.')
      .regex(/[0-9]/, 'Password must contain at least one number.'),
    password_confirmation: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: 'Passwords do not match',
    path: ['password_confirmation'],
  });

type ResetForm = z.infer<typeof resetFormSchema>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const token = (params?.token as string) || '';
  const email = searchParams.get('email') || '';

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data: tokenValidation, isLoading: isValidating, isError: validationFailed } =
    useValidateResetTokenQuery(token, email);

  const { mutateAsync: resetPassword } = useResetPasswordMutation();

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetForm>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: { password: '', password_confirmation: '' },
  });

  const onSubmit = async (data: ResetForm): Promise<void> => {
    if (!token || !email) return;

    try {
      const res = await resetPassword({
        email,
        token,
        password: data.password,
        password_confirmation: data.password_confirmation,
      });
      setSuccessMessage(res.message || 'Your password has been reset successfully.');
    } catch (err: unknown) {
      const apiErr = err as { errors?: { token?: string[], password?: string[], password_confirmation?: string[] }, message?: string };
      if (apiErr?.errors?.token) {
        setError('root', {
          message: 'This reset link is invalid or has expired. Please request a new one.',
        });
      } else if (apiErr?.errors?.password) {
        setError('password', { message: apiErr.errors.password[0] });
      } else if (apiErr?.errors?.password_confirmation) {
        setError('password_confirmation', { message: apiErr.errors.password_confirmation[0] });
      } else {
        setError('root', { message: apiErr?.message ?? 'Something went wrong. Please try again.' });
      }
    }
  };

  const isTokenInvalid =
    validationFailed || (tokenValidation && tokenValidation.data?.valid === false);

  const goToLogin = (e: React.MouseEvent) => {
    e.preventDefault();
    router.push('/login');
  };

  const goToForgotPassword = (e: React.MouseEvent) => {
    e.preventDefault();
    router.push(`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`);
  };

  if (successMessage) {
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center min-h-screen bg-[#0F2B36] px-4 overflow-hidden">
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center opacity-40 mix-blend-overlay"
          style={{
            backgroundImage: "url('/assets/fac-mob-login-bg-gradient.png')",
            backgroundRepeat: 'no-repeat',
          }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#0A1D25] via-[#0F2B36] to-[#0D252F] opacity-90" />

        <div className="relative z-10 w-full max-w-sm flex flex-col items-center text-center px-4">
          <h2 className="text-3xl font-extrabold text-[#F1F1F1] mb-4 leading-normal font-sans">
            Password Reset
          </h2>
          <p className="text-sm text-[#DEDEDE] leading-relaxed mb-8 font-sans">
            {successMessage}
          </p>
          <button
            onClick={goToLogin}
            className="w-full h-[51px] rounded-[30px] bg-[#75ADAF] hover:bg-[#66989A] text-white font-semibold flex items-center justify-center transition-all duration-200 shadow-md active:scale-95"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (isValidating) {
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center min-h-screen bg-[#0F2B36] px-4 overflow-hidden">
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#0A1D25] via-[#0F2B36] to-[#0D252F] opacity-90" />
        <div className="relative z-10 flex flex-col items-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent mb-4" />
          <p className="text-[#DEDEDE] text-sm font-sans">Verifying reset link…</p>
        </div>
      </div>
    );
  }

  if (isTokenInvalid) {
    const errorMessage = tokenValidation?.message || 'This password reset link is invalid or has expired.';
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center min-h-screen bg-[#0F2B36] px-4 overflow-hidden">
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center opacity-40 mix-blend-overlay"
          style={{
            backgroundImage: "url('/assets/fac-mob-login-bg-gradient.png')",
            backgroundRepeat: 'no-repeat',
          }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#0A1D25] via-[#0F2B36] to-[#0D252F] opacity-90" />

        <div className="relative z-10 w-full max-w-sm flex flex-col items-center text-center px-4">
          <h2 className="text-3xl font-extrabold text-[#F1F1F1] mb-4 leading-normal font-sans">
            Link Expired
          </h2>
          <p className="text-sm text-[#DEDEDE] leading-relaxed mb-8 font-sans">
            {errorMessage}
          </p>
          <button
            onClick={goToForgotPassword}
            className="w-full h-[51px] rounded-[30px] bg-[#75ADAF] hover:bg-[#66989A] text-white font-semibold flex items-center justify-center transition-all duration-200 shadow-md active:scale-95 mb-4"
          >
            Request New Link
          </button>
          <a
            href="#"
            onClick={goToLogin}
            className="text-xs font-semibold text-[#FAFAFA] hover:underline font-sans"
          >
            Back to Login
          </a>
        </div>
      </div>
    );
  }

  const hasTokenError = errors.root?.message?.includes('invalid or has expired');

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center min-h-screen bg-[#0F2B36] px-4 overflow-hidden">
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center opacity-40 mix-blend-overlay"
        style={{
          backgroundImage: "url('/assets/fac-mob-login-bg-gradient.png')",
          backgroundRepeat: 'no-repeat',
        }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#0A1D25] via-[#0F2B36] to-[#0D252F] opacity-90" />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit(onSubmit)}
          className="w-full flex flex-col px-4"
        >
          <h2 className="text-3xl font-extrabold text-[#F1F1F1] mb-3 text-center leading-normal font-sans">
            Reset Password
          </h2>
          <p className="text-sm text-[#DEDEDE] leading-relaxed text-center mb-8 font-sans">
            Enter a new password for your account.
          </p>

          {errors.root && (
            <p className="text-[#E74C3C] text-sm mb-4 text-center font-sans">
              {errors.root.message}
            </p>
          )}

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                placeholder="New Password"
                isPassword
                autoComplete="new-password"
                onBlur={onBlur}
                onChange={(e) => onChange(e.target.value)}
                value={value}
                error={errors.password?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="password_confirmation"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                placeholder="Confirm New Password"
                isPassword
                autoComplete="new-password"
                onBlur={onBlur}
                onChange={(e) => onChange(e.target.value)}
                value={value}
                error={errors.password_confirmation?.message}
              />
            )}
          />

          {hasTokenError ? (
            <button
              type="button"
              onClick={goToForgotPassword}
              className="w-full h-[51px] rounded-[30px] bg-[#75ADAF] hover:bg-[#66989A] text-white font-semibold flex items-center justify-center transition-all duration-200 shadow-md active:scale-95"
            >
              Request New Link
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full h-[51px] rounded-[30px] bg-[#75ADAF] hover:bg-[#66989A] text-white font-semibold flex items-center justify-center transition-all duration-200 shadow-md ${
                isSubmitting ? 'opacity-60 cursor-not-allowed' : 'active:scale-95'
              }`}
            >
              {isSubmitting ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                'Reset Password'
              )}
            </button>
          )}

          <a
            href="#"
            onClick={goToLogin}
            className="mt-6 text-center text-xs font-semibold text-[#FAFAFA] hover:underline font-sans"
          >
            Back to Login
          </a>
        </motion.form>
      </div>
    </div>
  );
}
