'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { X, Smartphone, WifiOff, MapPin, Camera, MessageSquare, ArrowRight, Share } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { usePwaInstall } from '@/hooks/use-pwa-install';
import Logo from '@/assets/images/logo.png';

interface DownloadAgentAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DownloadAgentAppModal({ isOpen, onClose }: DownloadAgentAppModalProps) {
  const { canInstall, promptInstall, isInstalled } = usePwaInstall();
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = window.navigator.userAgent.toLowerCase();
      const isIphoneOrIpad = ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod');
      setIsIos(isIphoneOrIpad);
    }
  }, []);

  const getAgentAppUrl = () => {
    if (typeof window === 'undefined') return 'https://agent.thefactory23.com';
    const host = window.location.host;
    const proto = window.location.protocol;
    
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      return `${proto}//localhost:3001`; // Local port for agent PWA
    }
    
    const parts = host.split('.');
    if (parts.length > 2) {
      parts.shift();
    }
    return `${proto}//agent.${parts.join('.')}`;
  };

  const handleInstallClick = async () => {
    if (canInstall) {
      const accepted = await promptInstall();
      if (accepted) {
        onClose();
      }
    } else {
      // Fallback redirect to subdomain if install isn't directly triggerable
      window.open(getAgentAppUrl(), '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-md cursor-pointer"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative w-full max-w-sm bg-[#0A1D25] border border-white/10 rounded-[32px] p-6 shadow-2xl z-10 flex flex-col font-sans text-white"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-white/5 text-white/40 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>

            {/* App branding */}
            <div className="flex flex-col items-center text-center mt-3">
              <div className="w-16 h-16 rounded-[22px] bg-gradient-to-tr from-[#113948] to-[#0A1D25] p-2.5 border border-white/10 flex items-center justify-center shadow-lg mb-4">
                <Image
                  src={Logo}
                  alt="Factory Agent App"
                  width={44}
                  height={44}
                  className="object-contain"
                />
              </div>
              <h3 className="font-sans font-bold text-xl leading-none">Factory 23 Agent</h3>
              <p className="text-[10px] font-bold text-[#75ADAF] uppercase tracking-wider mt-1.5">
                Progressive Web App
              </p>
              <p className="text-xs text-white/50 leading-relaxed mt-3 max-w-[260px]">
                Your offline-first field companion—tasks, tracking, CRM, and communication in one app.
              </p>
            </div>

            {/* Features lists */}
            <div className="flex flex-col gap-3 my-6 bg-white/[0.02] border border-white/5 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-[#75ADAF] mt-0.5">
                  <WifiOff size={12} />
                </div>
                <div>
                  <p className="text-xs font-bold leading-tight">Offline-First Engine</p>
                  <p className="text-[10px] text-white/40 mt-0.5">Sync tasks and queues automatically when online.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-[#75ADAF] mt-0.5">
                  <MapPin size={12} />
                </div>
                <div>
                  <p className="text-xs font-bold leading-tight">Smart Routing & GPS</p>
                  <p className="text-[10px] text-white/40 mt-0.5">Mapbox location tracking and destination geofencing.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-[#75ADAF] mt-0.5">
                  <Camera size={12} />
                </div>
                <div>
                  <p className="text-xs font-bold leading-tight">Camera Proof Capture</p>
                  <p className="text-[10px] text-white/40 mt-0.5">Take visit confirmation pictures directly in browser.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-[#75ADAF] mt-0.5">
                  <MessageSquare size={12} />
                </div>
                <div>
                  <p className="text-xs font-bold leading-tight">AI Chat Assistant</p>
                  <p className="text-[10px] text-white/40 mt-0.5">Discuss site objectives with local intelligence context.</p>
                </div>
              </div>
            </div>

            {/* Action instructions / CTA */}
            <div className="flex flex-col gap-2.5">
              {isInstalled ? (
                <a
                  href={getAgentAppUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-12 rounded-full bg-[#75ADAF] hover:bg-[#66989A] text-white font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md"
                >
                  <span>Open Agent App</span>
                  <ArrowRight size={14} />
                </a>
              ) : isIos ? (
                <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex flex-col gap-2.5 text-xs text-white/70 select-none">
                  <div className="flex items-center gap-2 font-bold text-white">
                    <Share size={14} className="text-[#75ADAF]" />
                    <span>How to Install on iOS:</span>
                  </div>
                  <ol className="list-decimal pl-4 space-y-1.5 text-[11px] leading-relaxed">
                    <li>Open Safari and visit <span className="text-white font-semibold">{getAgentAppUrl().replace(/^https?:\/\//, '')}</span>.</li>
                    <li>Tap the Share button <span className="bg-white/10 px-1.5 py-0.5 rounded text-white font-bold">Share 📤</span> in browser navigation.</li>
                    <li>Select <span className="bg-white/10 px-1.5 py-0.5 rounded text-white font-bold">Add to Home Screen ➕</span> from menu options.</li>
                  </ol>
                </div>
              ) : (
                <button
                  onClick={handleInstallClick}
                  className="w-full h-12 rounded-full bg-[#75ADAF] hover:bg-[#66989A] text-white font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Smartphone size={14} />
                  <span>{canInstall ? 'Install Agent App' : 'Get Agent App'}</span>
                </button>
              )}

              <button
                onClick={onClose}
                className="w-full h-11 border border-white/10 hover:border-white/20 rounded-full text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 active:scale-95 transition-all"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
