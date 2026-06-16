'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';

import { useForgotPasswordMutation } from '@/features/auth';
import { Input } from '@/components/ui/Input';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
});

type ForgotPasswordForm = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillEmail = searchParams.get('email') || '';
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { mutateAsync: forgotPassword } = useForgotPasswordMutation();

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(schema),
    defaultValues: { email: prefillEmail },
  });

  const onSubmit = async (data: ForgotPasswordForm): Promise<void> => {
    try {
      const res = await forgotPassword({ email: data.email });
      setSuccessMessage(res.message || 'Check your email for a reset link.');
    } catch (err: any) {
      if (err?.errors?.email) {
        setError('email', { message: err.errors.email[0] });
      } else {
        setError('root', { message: err?.message ?? 'Something went wrong. Please try again.' });
      }
    }
  };

  const goToLogin = (e: React.MouseEvent) => {
    e.preventDefault();
    router.push('/login');
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
        {successMessage ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full flex flex-col px-4 text-center"
          >
            <h2 className="text-3xl font-extrabold text-[#F1F1F1] mb-4 leading-normal font-sans">
              Check Your Email
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
          </motion.div>
        ) : (
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleSubmit(onSubmit)}
            className="w-full flex flex-col px-4"
          >
            <h2 className="text-3xl font-extrabold text-[#F1F1F1] mb-3 text-center leading-normal font-sans">
              Forgot Password
            </h2>
            <p className="text-sm text-[#DEDEDE] leading-relaxed text-center mb-8 font-sans">
              Enter your email and we'll send a reset link if your account is eligible.
            </p>

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
                  placeholder="Email"
                  type="email"
                  autoComplete="email"
                  onBlur={onBlur}
                  onChange={(e) => onChange(e.target.value)}
                  value={value}
                  error={errors.email?.message}
                />
              )}
            />

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
                'Send Reset Link'
              )}
            </button>

            <a
              href="#"
              onClick={goToLogin}
              className="mt-6 text-center text-xs font-semibold text-[#FAFAFA] hover:underline font-sans"
            >
              Back to Login
            </a>
          </motion.form>
        )}
      </div>
    </div>
  );
}
