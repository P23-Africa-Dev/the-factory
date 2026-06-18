'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Smartphone, Share, CheckCircle2 } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { isStandaloneMode } from '@/lib/pwa/standalone';
import { isIosDevice } from '@/lib/pwa/device';
import { FactoryLogo } from '@/components/branding/FactoryLogo';

export function MobileInstallContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canInstall, isInstalled, install } = usePwaInstall();
  const [isIos, setIsIos] = useState(false);
  const [installAttempted, setInstallAttempted] = useState(false);

  const fromPath = searchParams.get('from') || '/';

  useEffect(() => {
    setIsIos(isIosDevice());
  }, []);

  useEffect(() => {
    if (isStandaloneMode() || isInstalled) {
      router.replace(fromPath.startsWith('/') ? fromPath : '/');
    }
  }, [isInstalled, router, fromPath]);

  useEffect(() => {
    if (canInstall && !installAttempted && !isIos) {
      setInstallAttempted(true);
      void install();
    }
  }, [canInstall, install, installAttempted, isIos]);

  const handleInstallClick = async () => {
    setInstallAttempted(true);
    const accepted = await install();
    if (accepted) {
      router.replace(fromPath.startsWith('/') ? fromPath : '/');
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A1D25] px-6 py-10 text-white">
      <div className="w-16 h-16 rounded-[22px] bg-gradient-to-tr from-[#113948] to-[#0A1D25] p-2.5 border border-white/10 flex items-center justify-center shadow-lg mb-5">
        <FactoryLogo size={36} alt="Factory 23 Agent" />
      </div>

      <h1 className="text-xl font-bold text-center">Install Factory 23 Agent</h1>
      <p className="mt-3 max-w-sm text-center text-sm text-white/70">
        Install the app on your home screen to access tasks, tracking, CRM, and offline sync.
      </p>

      {isIos ? (
        <div className="mt-8 w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#75ADAF]">
            <Share size={16} />
            <span>Add to Home Screen</span>
          </div>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-xs text-white/75 leading-relaxed">
            <li>
              Tap the <span className="font-semibold text-white">Share button</span> in Safari&apos;s
              navigation bar.
            </li>
            <li>
              Select <span className="font-semibold text-white">Add to Home Screen</span>.
            </li>
            <li>
              Tap <span className="font-semibold text-white">Add</span>, then open the app from your
              home screen.
            </li>
          </ol>
        </div>
      ) : canInstall ? (
        <div className="mt-8 w-full max-w-sm space-y-4">
          <p className="text-center text-xs text-white/60">
            Tap below if the install prompt did not appear automatically.
          </p>
          <button
            type="button"
            onClick={() => void handleInstallClick()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#75ADAF] text-sm font-bold text-[#0A1D25] transition hover:bg-[#66989A]"
          >
            <Smartphone size={16} />
            Install Now
          </button>
        </div>
      ) : (
        <div className="mt-8 w-full max-w-sm rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-center">
          <CheckCircle2 size={24} className="mx-auto text-amber-200" />
          <p className="mt-3 text-sm font-semibold text-amber-100">Already installed?</p>
          <p className="mt-2 text-xs text-amber-100/80 leading-relaxed">
            Open Factory 23 Agent from your home screen. Browser access is not supported for field
            workflows.
          </p>
          <p className="mt-4 text-xs text-white/50">
            If you have not installed yet, use Chrome and look for the browser menu install option,
            or revisit this page after clearing site data.
          </p>
        </div>
      )}
    </div>
  );
}
