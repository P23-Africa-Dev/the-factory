'use client';

import Image from 'next/image';

const LOGO_ASPECT = 208 / 121;

type FactoryLogoProps = {
  /** Visual height in pixels; width scales from the logo aspect ratio. */
  size?: number;
  className?: string;
  alt?: string;
};

/** Factory 23 butterfly mark — served from public assets (always available offline). */
export function FactoryLogo({
  size = 44,
  className = 'object-contain',
  alt = 'Factory 23',
}: FactoryLogoProps) {
  const height = size;
  const width = Math.round(size * LOGO_ASPECT);

  return (
    <Image
      src="/assets/fac-mob-logo.svg"
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority
    />
  );
}
