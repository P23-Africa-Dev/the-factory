'use client';

import { QRCodeSVG } from 'qrcode.react';
import { getAgentApkUrl, getAgentInstallUrl } from '@/lib/agent-pwa-url';

type AgentInstallQrCodeProps = {
  size?: number;
  /** Override the encoded URL (defaults to PWA install URL). */
  value?: string;
  /** Accessible label for the QR image. */
  label?: string;
};

export function AgentInstallQrCode({
  size = 200,
  value,
  label = 'Scan to install Factory 23 Agent',
}: AgentInstallQrCodeProps) {
  const encoded = value ?? getAgentInstallUrl();

  return (
    <div className="rounded-2xl bg-white p-4 shadow-lg inline-flex" role="img" aria-label={label}>
      <QRCodeSVG value={encoded} size={size} level="M" includeMargin />
    </div>
  );
}

export function AgentApkQrCode({ size = 200 }: { size?: number }) {
  return (
    <AgentInstallQrCode
      size={size}
      value={getAgentApkUrl()}
      label="Scan to download the Factory 23 Agent Android APK"
    />
  );
}
