'use client';

import { useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { createOfflineReconnectHandler } from '@/lib/offline/offline-reconnect';

export default function OfflinePage() {
  useEffect(() => {
    const handler = createOfflineReconnectHandler();
    handler.startListening();
    return () => handler.stopListening();
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A1D25] px-6 py-10 text-center text-white">
      <div className="relative mb-5 flex h-[88px] w-[88px] items-center justify-center">
        <span className="absolute inset-0 animate-[pulseRing_2.4s_ease-out_infinite] rounded-full border border-amber-300/35" />
        <span className="absolute inset-0 animate-[pulseRing_2.4s_ease-out_infinite] rounded-full border border-amber-300/35 [animation-delay:0.8s]" />
        <div className="relative z-10 flex h-[88px] w-[88px] animate-[floatIcon_2.8s_ease-in-out_infinite] items-center justify-center rounded-full border border-amber-300/30 bg-amber-500/10 text-amber-200">
          <WifiOff size={30} />
        </div>
      </div>
      <h1 className="text-xl font-semibold">This page isn’t available offline</h1>
      <p className="mt-3 max-w-md text-sm text-white/75">
        You can keep working in pages you’ve already opened. Any actions you take are saved
        locally and synchronize automatically when connectivity returns.
      </p>

      <div className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-white/80">
        <span>Waiting for connection</span>
        <span className="inline-flex gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 animate-[bounceDot_1.2s_ease-in-out_infinite] rounded-full bg-[#75ADAF]" />
          <span className="h-1.5 w-1.5 animate-[bounceDot_1.2s_ease-in-out_infinite] rounded-full bg-[#75ADAF] [animation-delay:0.15s]" />
          <span className="h-1.5 w-1.5 animate-[bounceDot_1.2s_ease-in-out_infinite] rounded-full bg-[#75ADAF] [animation-delay:0.3s]" />
        </span>
      </div>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-6 rounded-xl border border-[#75ADAF]/40 bg-[#75ADAF]/10 px-4 py-2 text-sm font-semibold text-[#75ADAF] transition hover:bg-[#75ADAF]/20"
      >
        Try again
      </button>
    </div>
  );
}
