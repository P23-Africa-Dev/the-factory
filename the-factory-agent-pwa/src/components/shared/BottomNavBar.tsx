'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';

export type ActiveTab = 0 | 1 | 2 | 3;

interface BottomNavBarProps {
  activeTab?: ActiveTab;
}

const TABS = [
  { id: 0, label: 'Home', path: '/', activeIcon: '/assets/nav-active-1.svg', defaultIcon: '/assets/nav-default-1.svg' },
  { id: 1, label: 'Map', path: '/map', activeIcon: '/assets/nav-active-2.svg', defaultIcon: '/assets/nav-default-2.svg' },
  { id: 2, label: 'CRM', path: '/crm', activeIcon: '/assets/nav-active-3.svg', defaultIcon: '/assets/nav-default-3.svg' },
  { id: 3, label: 'Assistant', path: '/assistant', activeIcon: '/assets/nav-active-4.svg', defaultIcon: '/assets/nav-default-4.svg' },
] as const;

export function BottomNavBar({ activeTab }: BottomNavBarProps): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();

  // Determine active tab based on activeTab prop or pathname fallback
  const getActiveTab = (): ActiveTab => {
    if (activeTab !== undefined) return activeTab;
    if (pathname.startsWith('/map')) return 1;
    if (pathname.startsWith('/crm')) return 2;
    if (pathname.startsWith('/assistant')) return 3;
    return 0; // Default to Home/Tasks
  };

  const currentActive = getActiveTab();

  const isCrmRoute = pathname.startsWith('/crm');
  const rxValue = isCrmRoute ? 32 : 0;
  const clipHeight = isCrmRoute ? 180 : 140;

  const isMapRoute = pathname.startsWith('/map');
  const baseFillColor = isMapRoute ? '#F2F4F5' : '#FFFFFF';

  const handleTabClick = (tabId: ActiveTab, path: string) => {
    router.push(path);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] select-none pb-[safe-area-inset-bottom]">
      {/* Container holding the wavy bar, centered and max-width matched to layout */}
      <div className="relative mx-auto w-full max-w-md h-[100px]">
        {/* SVG background layer */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 440 140"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="navL" x1="-7" y1="113.873" x2="256.445" y2="180.85" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#ECC3FB" />
              <Stop offset="1" stopColor="#E1DAFA" />
            </linearGradient>
            <linearGradient id="navR" x1="336.5" y1="74.9087" x2="161.041" y2="140.961" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#44AFCD" />
              <Stop offset="1" stopColor="#E4D5FA" />
            </linearGradient>
            <clipPath id="waveClip">
              <rect x="-50" y="44" width="540" height="150" />
            </clipPath>
            <clipPath id="roundedNavBar">
              <rect width="440" height={clipHeight} rx={rxValue} />
            </clipPath>
          </defs>
          <g clipPath="url(#roundedNavBar)">
            <rect width="440" height={clipHeight} fill={baseFillColor} rx={rxValue} />
            <path
              d="M-14.339 63.0683L-31.6672 72.636C-38.0421 76.1558 -42 82.8565 -42 90.1385V199.75C-42 232.804 168.667 213.522 274 199.75V91.0538C274 83.296 269.514 76.238 262.489 72.945L238.946 61.9078C233.656 59.4279 227.547 59.385 222.223 61.7902L194.825 74.1671C189.017 76.7909 182.307 76.4896 176.757 73.3558L159.184 63.4325C153.197 60.0519 145.894 59.9832 139.845 63.2506L121.213 73.3146C115.391 76.4594 108.39 76.5209 102.514 73.4791L82.1097 62.9171C76.1751 59.8452 69.0985 59.9401 63.2485 63.1702L44.9504 73.2734C39.2024 76.4471 32.2628 76.5974 26.3829 73.6755L4.2285 62.6662C-1.65144 59.7443 -8.59103 59.8946 -14.339 63.0683Z"
              fill="url(#navL)"
              clipPath="url(#waveClip)"
            />
            <path
              d="M210.536 87.4457L205.508 85.9473C193.976 82.5099 181.154 85.137 171.143 92.9884C159.91 101.799 153.893 115.848 155.452 129.645L166.521 227.575C169.851 257.034 337.143 213.729 445.497 180.937C464.887 175.069 477.62 155.5 475.362 135.523L468.579 75.5156C466.831 60.0484 456.358 47.6081 441.735 43.6274L437.627 42.5092C426.74 39.5455 414.817 41.6371 404.943 48.2427L395.131 54.8074C384.476 61.9361 371.465 63.7162 360.043 59.6081C347.72 55.1758 333.468 57.7299 322.481 66.1946C311.79 74.4306 298.008 77.1553 285.844 73.2995L283.734 72.6309C271.449 68.7369 257.557 71.5317 246.829 79.9456C236.289 88.2124 222.679 91.065 210.536 87.4457Z"
              fill="url(#navR)"
              clipPath="url(#waveClip)"
            />
            {/* Cloud bubble circles for targets */}
            <circle cx="125.676" cy="87" r="44" fill="#F1FAFD" />
            <circle cx="188.676" cy="87" r="44" fill="#F1FAFD" />
            <circle cx="251.676" cy="87" r="44" fill="#F1FAFD" />
            <circle cx="314.676" cy="87" r="44" fill="#F1FAFD" />
          </g>
        </svg>

        {/* Buttons overlays aligned mathematically to the background curves */}
        <div className="absolute inset-0 pointer-events-none">
          {TABS.map((tab) => {
            const isActive = currentActive === tab.id;
            const leftPositions = ['28.56%', '42.88%', '57.20%', '71.52%'] as const;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id, tab.path)}
                className="absolute w-14 h-14 flex items-center justify-center outline-none focus:outline-none transition-transform active:scale-90 pointer-events-auto cursor-pointer"
                style={{
                  left: leftPositions[tab.id],
                  top: '62.14%',
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <img
                  src={isActive ? tab.activeIcon : tab.defaultIcon}
                  alt={tab.label}
                  className="w-12 h-12 object-contain"
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Subcomponent to help with SVG linear gradients Stop (due to TS React namespace issue on Stop)
const Stop = (props: React.SVGProps<SVGStopElement>) => <stop {...props} />;
