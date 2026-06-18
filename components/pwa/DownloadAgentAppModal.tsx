'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  X,
  Smartphone,
  WifiOff,
  MapPin,
  Camera,
  MessageSquare,
  ArrowRight,
  Share,
  ScanLine,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { AgentInstallQrCode } from '@/components/pwa/AgentInstallQrCode';
import { getAgentInstallUrl, getAgentPwaUrl, isDesktopDevice, isMobileDevice } from '@/lib/agent-pwa-url';
import Logo from '@/assets/images/logo.png';

interface DownloadAgentAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DownloadAgentAppModal({ isOpen, onClose }: DownloadAgentAppModalProps) {
  const [isDesktop, setIsDesktop] = useState(true);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsDesktop(isDesktopDevice());
    const ua = window.navigator.userAgent.toLowerCase();
    setIsIos(/iphone|ipad|ipod/.test(ua));
  }, [isOpen]);

  const agentUrl = getAgentPwaUrl();
  const installUrl = getAgentInstallUrl();

  const handleMobileInstall = () => {
    window.location.href = installUrl;
    onClose();
  };

  const handleOpenAgentApp = () => {
    window.location.href = agentUrl;
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-md cursor-pointer"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative w-full max-w-sm bg-[#0A1D25] border border-white/10 rounded-[32px] p-6 shadow-2xl z-10 flex flex-col font-sans text-white max-h-[90vh] overflow-y-auto"
          >
            <button
              onClick={onClose}
              className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-white/5 text-white/40 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>

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

            <div className="flex flex-col gap-2.5">
              {isDesktop ? (
                <div className="flex flex-col items-center gap-4">
                  <AgentInstallQrCode size={180} />
                  <div className="w-full rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-left">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#75ADAF] mb-2">
                      <ScanLine size={14} />
                      <span>Install on your phone</span>
                    </div>
                    <ol className="list-decimal pl-4 space-y-1.5 text-[11px] text-white/70 leading-relaxed">
                      <li>Scan the QR code with your mobile device.</li>
                      <li>Follow the install steps on your phone.</li>
                      <li>Open Factory 23 Agent from your home screen.</li>
                    </ol>
                  </div>
                  <p className="text-[10px] text-white/30 break-all text-center">{installUrl}</p>
                </div>
              ) : isIos ? (
                <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex flex-col gap-2.5 text-xs text-white/70 select-none">
                  <div className="flex items-center gap-2 font-bold text-white">
                    <Share size={14} className="text-[#75ADAF]" />
                    <span>How to Install on iOS:</span>
                  </div>
                  <ol className="list-decimal pl-4 space-y-1.5 text-[11px] leading-relaxed">
                    <li>
                      Open Safari and visit{' '}
                      <span className="text-white font-semibold">{agentUrl.replace(/^https?:\/\//, '')}</span>.
                    </li>
                    <li>
                      Tap the Share button{' '}
                      <span className="bg-white/10 px-1.5 py-0.5 rounded text-white font-bold">Share</span> in browser
                      navigation.
                    </li>
                    <li>
                      Select{' '}
                      <span className="bg-white/10 px-1.5 py-0.5 rounded text-white font-bold">
                        Add to Home Screen
                      </span>{' '}
                      from menu options.
                    </li>
                  </ol>
                  <button
                    onClick={handleMobileInstall}
                    className="mt-2 w-full h-12 rounded-full bg-[#75ADAF] hover:bg-[#66989A] text-white font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <Smartphone size={14} />
                    <span>Go to Install Page</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleMobileInstall}
                  className="w-full h-12 rounded-full bg-[#75ADAF] hover:bg-[#66989A] text-white font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Smartphone size={14} />
                  <span>Install Agent App</span>
                </button>
              )}

              {!isDesktop && isMobileDevice() ? (
                <button
                  onClick={handleOpenAgentApp}
                  className="w-full h-11 border border-white/10 hover:border-white/20 rounded-full text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 active:scale-95 transition-all"
                >
                  Open Agent App in Browser
                </button>
              ) : null}

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
