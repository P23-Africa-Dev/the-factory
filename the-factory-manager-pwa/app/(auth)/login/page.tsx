'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';

import { useAuth, useLoginMutation } from '@/features/auth';
import { Input } from '@/components/ui/Input';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

const ACCOUNT_STATUS_TITLES: Record<string, string> = {
  deactivated: 'Account Deactivated',
  suspended_temporary: 'Account Temporarily Suspended',
  suspended_permanent: 'Account Permanently Suspended',
};

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, isSignedIn } = useAuth();
  const { mutateAsync: login } = useLoginMutation();

  const [step, setStep] = useState<'welcome' | 'login'>('welcome');

  useEffect(() => {
    if (isSignedIn) {
      router.replace('/');
    }
  }, [isSignedIn, router]);

  const accountStatusParam = searchParams.get('account_status');
  const messageParam = searchParams.get('message');

  const [accountBlockNotice, setAccountBlockNotice] = useState<{
    code: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (accountStatusParam && messageParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAccountBlockNotice({ code: accountStatusParam, message: messageParam });
      setStep('login');
    }
  }, [accountStatusParam, messageParam]);

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginForm): Promise<void> => {
    setAccountBlockNotice(null);
    try {
      const response = await login(data);
      signIn(response);
      router.replace('/');
    } catch (err: unknown) {
      const apiErr = err as {
        status?: number;
        code?: string;
        message?: string;
        errors?: { email?: string[]; password?: string[] };
      };
      if (apiErr?.status === 403 && apiErr?.code && apiErr.code in ACCOUNT_STATUS_TITLES) {
        setAccountBlockNotice({ code: apiErr.code, message: apiErr.message || 'Account blocked' });
      } else if (apiErr?.errors?.email) {
        setError('email', { message: apiErr.errors.email[0] });
      } else if (apiErr?.errors?.password) {
        setError('password', { message: apiErr.errors.password[0] });
      } else {
        setError('root', { message: apiErr?.message ?? 'Invalid credentials' });
      }
    }
  };

  const goToForgotPassword = (e: React.MouseEvent) => {
    e.preventDefault();
    router.push('/forgot-password');
  };

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
        <AnimatePresence mode="wait">
          {step === 'welcome' ? (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -15 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="w-full flex flex-col items-center text-center px-4"
            >
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#75ADAF]/35 bg-[#75ADAF]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#75ADAF]">
                Owner • Admin • Supervisor
              </div>
              <h1 className="text-3xl font-extrabold text-[#F1F1F1] mb-6 leading-normal font-sans">
                Factory 23 Manager
              </h1>
              <p className="text-sm text-[#DEDEDE] leading-relaxed mb-10 max-w-[300px] font-sans">
                Command your field workforce, live fleet map, tasks, KPIs, CRM pipeline, and ELY executive copilot on the go.
              </p>
              <button
                type="button"
                onClick={() => setStep('login')}
                className="w-full h-[51px] rounded-[30px] bg-[#75ADAF] hover:bg-[#66989A] text-white font-semibold flex items-center justify-center transition-all duration-200 active:scale-95 shadow-md"
              >
                Continue as Manager
              </button>
            </motion.div>
          ) : (
            <motion.form
              key="login"
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={handleSubmit(onSubmit)}
              className="w-full flex flex-col px-4"
            >
              <div className="mb-2 flex justify-center">
                <span className="inline-flex items-center rounded-full border border-[#75ADAF]/35 bg-[#75ADAF]/15 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#75ADAF]">
                  Management Portal
                </span>
              </div>
              <h2 className="text-3xl font-extrabold text-[#F1F1F1] mb-6 text-center leading-normal font-sans">
                Manager Sign In
              </h2>

              {accountBlockNotice && (
                <div className="bg-[#2D1518] border border-[#E74C3C] rounded-xl p-4 mb-5">
                  <p className="text-[#FF6B6B] text-sm font-bold mb-1.5 text-center font-sans">
                    {ACCOUNT_STATUS_TITLES[accountBlockNotice.code] ?? 'Account Restricted'}
                  </p>
                  <p className="text-[#F5C6CB] text-xs leading-relaxed text-center font-sans">
                    {accountBlockNotice.message}
                  </p>
                </div>
              )}

              {errors.root && (
                <p className="text-[#E74C3C] text-sm mb-4 text-center font-sans">
                  {errors.root.message}
                </p>
              )}

              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    placeholder="Manager Email"
                    type="email"
                    autoComplete="email"
                    onBlur={onBlur}
                    onChange={(e) => onChange(e.target.value)}
                    value={value}
                    error={errors.email?.message}
                  />
                )}
              />

              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    placeholder="Password"
                    isPassword
                    autoComplete="current-password"
                    onBlur={onBlur}
                    onChange={(e) => onChange(e.target.value)}
                    value={value}
                    error={errors.password?.message}
                  />
                )}
              />

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full h-[51px] rounded-[30px] bg-[#75ADAF] hover:bg-[#66989A] text-white font-semibold flex items-center justify-center transition-all duration-200 mt-1 shadow-md ${
                  isSubmitting ? 'opacity-60 cursor-not-allowed' : 'active:scale-95'
                }`}
              >
                {isSubmitting ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  'Sign In'
                )}
              </button>

              <a
                href="#"
                onClick={goToForgotPassword}
                className="mt-5 text-center text-xs font-semibold text-[#FAFAFA] hover:underline font-sans"
              >
                Forgot Password?
              </a>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function LoginScreen() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center min-h-screen bg-[#0F2B36]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
