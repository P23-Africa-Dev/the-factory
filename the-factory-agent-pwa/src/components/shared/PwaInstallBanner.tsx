'use client';

import React, { useEffect, useState } from 'react';
import { X, Smartphone, Share, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePwaInstall } from '@/hooks/usePwaInstall';

export function PwaInstallBanner() {
  const { canInstall, isInstalled, install } = usePwaInstall();
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [hasIntent, setHasIntent] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if dismissed in this session
    const isDismissed = sessionStorage.getItem('pwa-banner-dismissed') === 'true';
    
    // Check if the user arrived with the install intent
    const urlParams = new URLSearchParams(window.location.search);
    const intent = urlParams.get('install') === 'true' || sessionStorage.getItem('pwa-auto-install') === 'true';
    
    setHasIntent(intent);
    
    // If they came with explicit intent, we force showing the banner (override prior dismissal in session)
    if (intent) {
      sessionStorage.removeItem('pwa-banner-dismissed');
      setDismissed(false);
    } else {
      setDismissed(isDismissed);
    }

    // iOS check
    const ua = window.navigator.userAgent.toLowerCase();
    const isIphoneOrIpad = ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod');
    setIsIos(isIphoneOrIpad);
  }, [canInstall, isInstalled]);

  // Don't render if PWA is already installed or if user dismissed the banner
  if (isInstalled || dismissed) return null;

  // Render only if the browser can install the PWA, or if the user is on iOS and has explicitly requested installation
  const shouldShow = canInstall || (isIos && hasIntent);
  if (!shouldShow) return null;

  const handleClose = () => {
    sessionStorage.setItem('pwa-banner-dismissed', 'true');
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
          {/* Subtle gradient glow decoration */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#75ADAF]/10 rounded-full blur-3xl pointer-events-none" />

          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/5 text-white/40 hover:text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>

          <div className="flex gap-4 items-start pr-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#113948] to-[#0A1D25] p-2 border border-white/10 flex items-center justify-center shadow-md shrink-0">
              <img
                src="/icons/icon-192x192.png"
                alt="F23 Agent Logo"
                width={38}
                height={38}
                className="object-contain"
              />
            </div>
            <div className="flex flex-col min-w-0">
              <h4 className="font-bold text-sm leading-tight text-white flex items-center gap-1.5">
                <span>Install Factory 23 Agent</span>
                <span className="text-[9px] font-extrabold text-[#75ADAF] bg-[#75ADAF]/10 border border-[#75ADAF]/20 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                  App
                </span>
              </h4>
              <p className="text-xs text-white/50 leading-relaxed mt-1">
                Install the app on your home screen for offline sync, turn-by-turn route tracking, and instant alerts.
              </p>
            </div>
          </div>

          <div className="w-full border-t border-white/5 my-0.5" />

          {isIos ? (
            /* iOS Custom Instruction Interface */
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#75ADAF]">
                <Share size={14} className="animate-bounce" />
                <span>Follow these steps in Safari:</span>
              </div>
              <ol className="list-decimal pl-4 space-y-1 text-[11px] text-white/70 leading-relaxed">
                <li>
                  Tap the <span className="font-semibold text-white">Share button 📤</span> in Safari's navigation bar.
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
            /* Android/Chrome Prompt Interface */
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
