'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { WifiOff } from 'lucide-react';

const QUICK_LINKS = [
  { href: '/tasks', label: 'Tasks' },
  { href: '/map', label: 'Map' },
  { href: '/meetings', label: 'Meetings' },
  { href: '/sync/queue', label: 'Sync queue' },
];

export default function OfflinePage() {
  useEffect(() => {
    const handleOnline = () => window.location.reload();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A1D25] px-6 py-10 text-center text-white">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-amber-300/30 bg-amber-500/10 text-amber-200">
        <WifiOff size={24} />
      </div>
      <h1 className="mt-5 text-xl font-semibold">This page isn’t available offline</h1>
      <p className="mt-3 max-w-md text-sm text-white/75">
        You can keep working in pages you’ve already opened. New actions, uploads, and tracking
        points are stored locally and synchronized automatically when connectivity returns.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10"
          >
            {link.label}
          </Link>
        ))}
      </div>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 rounded-xl border border-[#75ADAF]/40 bg-[#75ADAF]/10 px-4 py-2 text-sm font-semibold text-[#75ADAF] transition hover:bg-[#75ADAF]/20"
      >
        Try again
      </button>
    </div>
  );
}
