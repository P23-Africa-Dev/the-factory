'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth';

export default function RootPage() {
  const { isSignedIn, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (isSignedIn) {
        router.replace('/tasks'); // redirect to dashboard or tasks, we'll implement dashboard in `app/(agent)/page.tsx`
      } else {
        router.replace('/login');
      }
    }
  }, [isSignedIn, isLoading, router]);

  return (
    <div className="flex flex-1 items-center justify-center min-h-screen bg-[#0A1D25]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
    </div>
  );
}
