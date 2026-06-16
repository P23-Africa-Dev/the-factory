'use client';

import React, { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import { AuthProvider } from '@/features/auth';
import { queryClient } from '@/lib/queryClient';
import { SessionExpiredModal } from '@/components/shared/SessionExpiredModal';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('PWA Service Worker registered with scope:', registration.scope);
          })
          .catch((error) => {
            console.error('PWA Service Worker registration failed:', error);
          });
      });
    }
  }, []);

  return (
    <html lang="en" className="h-full antialiased dark" suppressHydrationWarning>
      <head>
        <title>Factory 23 Agent</title>
        <meta name="description" content="Field agent management app — tasks, tracking, CRM, all in one app" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0A1D25" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="F23 Agent" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body className="min-h-full flex flex-col bg-[#0A1D25] text-white overflow-x-hidden selection:bg-[#75ADAF]/30">
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <main className="flex flex-col flex-1 min-h-screen">
              {children}
            </main>
            <SessionExpiredModal />
          </QueryClientProvider>
          <Toaster 
            theme="dark" 
            position="top-center" 
            toastOptions={{
              style: {
                background: '#0B2330',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#FAFAFA',
              }
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
