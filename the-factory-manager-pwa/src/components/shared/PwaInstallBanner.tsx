'use client';

import React, { useEffect, useState } from 'react';
import { X, Smartphone, Share } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { useShouldShowInstallBanner } from '@/components/guards/PwaAccessGuard';
import { FactoryLogo } from '@/components/branding/FactoryLogo';

export function PwaInstallBanner() {
  const showOnRoute = useShouldShowInstallBanner();
  const { canInstall, isInstalled, install } = usePwaInstall();
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [hasIntent, setHasIntent] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isDismissed = sessionStorage.getItem('pwa-manager-banner-dismissed') === 'true';
    const urlParams = new URLSearchParams(window.location.search);
    const intent = urlParams.get('install') === 'true' || sessionStorage.getItem('pwa-auto-install') === 'true';
    
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasIntent(intent);
    
    if (intent) {
      sessionStorage.removeItem('pwa-manager-banner-dismissed');
      setDismissed(false);
    } else {
      setDismissed(isDismissed);
    }

    const ua = window.navigator.userAgent.toLowerCase();
    const isIphoneOrIpad = ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod');
    setIsIos(isIphoneOrIpad);
  }, [canInstall, isInstalled]);

  if (!showOnRoute) return null;
  if (isInstalled || dismissed) return null;

  const shouldShow = canInstall || (isIos && hasIntent);
  if (!shouldShow) return null;

  const handleClose = () => {
    sessionStorage.setItem('pwa-manager-banner-dismissed', 'true');
    setDismissed(true);
  };

  const handleInstallClick = async () => {
    const success = await install();
    if (success) {
      handleClose();
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 md:p-6 pointer-events-none flex justify-center">
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 100, scale: 0.95 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-lg bg-[#0A1D25]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-5 md:p-6 shadow-2xl pointer-events-auto flex flex-col gap-4 font-sans text-white relative overflow-hidden"
        >
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#75ADAF]/10 rounded-full blur-3xl pointer-events-none" />

          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/5 text-white/40 hover:text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>

          <div className="flex gap-4 items-start pr-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#113948] to-[#0A1D25] p-2 border border-white/10 flex items-center justify-center shadow-md shrink-0">
              <FactoryLogo size={32} alt="Factory 23 Manager" />
            </div>
            <div className="flex flex-col min-w-0">
              <h4 className="font-bold text-sm leading-tight text-white flex items-center gap-1.5">
                <span>Install Factory 23 Manager</span>
                <span className="text-[9px] font-extrabold text-[#75ADAF] bg-[#75ADAF]/10 border border-[#75ADAF]/20 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                  Manager
                </span>
              </h4>
              <p className="text-xs text-white/50 leading-relaxed mt-1">
                Install the app on your home screen for live fleet tracking, task &amp; KPI management, CRM, and instant alerts.
              </p>
            </div>
          </div>

          <div className="w-full border-t border-white/5 my-0.5" />

          {isIos ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#75ADAF]">
                <Share size={14} className="animate-bounce" />
                <span>Follow these steps in Safari:</span>
              </div>
              <ol className="list-decimal pl-4 space-y-1 text-[11px] text-white/70 leading-relaxed">
                <li>
                  Tap the <span className="font-semibold text-white">Share button 📤</span> in Safari&apos;s navigation bar.
                </li>
                <li>
                  Scroll down the options list and select <span className="font-semibold text-white">Add to Home Screen ➕</span>.
                </li>
                <li>
                  Tap <span className="font-semibold text-white">Add</span> in the top right to complete installation.
                </li>
              </ol>
            </div>
          ) : (
            <div className="flex items-center gap-3 w-full">
              <button
                onClick={handleClose}
                className="flex-1 h-11 border border-white/10 hover:border-white/20 rounded-2xl text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
              >
                Maybe Later
              </button>
              <button
                onClick={handleInstallClick}
                className="flex-1 h-11 bg-gradient-to-r from-[#75ADAF] to-[#66989A] hover:from-[#84bcbe] hover:to-[#73a7a9] text-slate-950 font-extrabold text-xs rounded-2xl active:scale-98 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#75ADAF]/10 hover:shadow-[#75ADAF]/20 cursor-pointer"
              >
                <Smartphone size={14} />
                <span>Install Now</span>
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
