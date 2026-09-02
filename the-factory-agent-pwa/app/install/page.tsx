'use client';

import { Smartphone, ScanLine, Download } from 'lucide-react';
import { InstallQrCode } from '@/components/pwa/InstallQrCode';
import { getAgentApkDownloadUrl, getAgentMobileInstallUrl } from '@/lib/pwa/url';

export default function DesktopInstallPage() {
  const installUrl = getAgentMobileInstallUrl();
  const apkUrl = getAgentApkDownloadUrl();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A1D25] px-6 py-10 text-white">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#75ADAF]/30 bg-[#75ADAF]/10 text-[#75ADAF]">
        <Smartphone size={26} />
      </div>

      <h1 className="mt-6 text-2xl font-bold text-center">Install Factory 23 Agent</h1>
      <p className="mt-3 max-w-md text-center text-sm text-white/70">
        This app is mobile-only. Scan the QR code with your phone to install the Factory Agent
        PWA and launch it from your home screen.
      </p>

      <div className="mt-8">
        <InstallQrCode value={installUrl} />
      </div>

      <div className="mt-8 w-full max-w-md space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/80">
        <div className="flex items-start gap-3">
          <ScanLine size={18} className="mt-0.5 shrink-0 text-[#75ADAF]" />
          <p>Scan with your mobile device camera or QR scanner.</p>
        </div>
        <p>2. Follow the on-screen steps to install the Factory Agent App.</p>
        <p>3. Open the app from your home screen to sign in and start working.</p>
      </div>

      {apkUrl ? (
        <div className="mt-6 w-full max-w-md rounded-2xl border border-[#75ADAF]/25 bg-[#75ADAF]/10 p-5 text-sm text-white/85">
          <p className="font-semibold text-white">Prefer continuous tracking when minimized?</p>
          <p className="mt-2 text-xs text-white/70 leading-relaxed">
            Install the Android APK for live GPS while the app is backgrounded or the screen is
            locked (Android only).
          </p>
          <a
            href={apkUrl}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#75ADAF] text-xs font-bold text-white hover:bg-[#66989A] active:scale-95 transition-all"
          >
            <Download size={14} />
            Download Android APK
          </a>
        </div>
      ) : null}

      <p className="mt-6 text-xs text-white/40 break-all text-center max-w-md">{installUrl}</p>
    </div>
  );
}
