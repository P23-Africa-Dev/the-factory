'use client';

import { QRCodeSVG } from 'qrcode.react';

type InstallQrCodeProps = {
  value: string;
  size?: number;
};

export function InstallQrCode({ value, size = 220 }: InstallQrCodeProps) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-lg">
      <QRCodeSVG value={value} size={size} level="M" includeMargin />
    </div>
  );
}
