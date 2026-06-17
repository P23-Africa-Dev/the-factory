'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isSignedIn, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isSignedIn) {
      router.replace('/');
    }
  }, [isSignedIn, isLoading, router]);

  if (isLoading || isSignedIn) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen bg-[#0F2B36]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
