'use client';

import { QRCodeSVG } from 'qrcode.react';
import { getAgentInstallUrl } from '@/lib/agent-pwa-url';

type AgentInstallQrCodeProps = {
  size?: number;
};

export function AgentInstallQrCode({ size = 200 }: AgentInstallQrCodeProps) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-lg inline-flex">
      <QRCodeSVG value={getAgentInstallUrl()} size={size} level="M" includeMargin />
    </div>
  );
}
