'use client';

import React, { useCallback } from 'react';
import { Sheet } from 'react-modal-sheet';

/** Clears the fixed bottom navigation bar (see AgentLayout). */
export const MAP_BOTTOM_NAV_OFFSET_PX = 100;

/** Snap point indices — must match `MAP_SHEET_SNAP_POINTS` order. */
export const MAP_SHEET_COLLAPSED_SNAP_INDEX = 1;
export const MAP_SHEET_MEDIUM_SNAP_INDEX = 2;
export const MAP_SHEET_EXPANDED_SNAP_INDEX = 3;

/** Ascending snap points: closed, collapsed handle, medium, expanded. */
export const MAP_SHEET_SNAP_POINTS = [0, 56, 0.22, 0.48];

export function MapBottomSheet({
  visible,
  onSnapChange,
  children,
}: {
  visible: boolean;
  onSnapChange?: (snapIndex: number) => void;
  children: React.ReactNode;
}) {
  const handleSnap = useCallback(
    (snapIndex: number) => {
      onSnapChange?.(snapIndex);
    },
    [onSnapChange],
  );

  if (!visible) return null;

  return (
    <Sheet
      isOpen
      onClose={() => {}}
      disableDismiss
      disableScrollLocking
      snapPoints={MAP_SHEET_SNAP_POINTS}
      initialSnap={MAP_SHEET_EXPANDED_SNAP_INDEX}
      onSnap={handleSnap}
      className="!pointer-events-none z-20"
      style={{ paddingBottom: MAP_BOTTOM_NAV_OFFSET_PX }}
      tweenConfig={{ ease: 'easeOut', duration: 0.28 }}
    >
      <Sheet.Container
        unstyled
        className="pointer-events-auto left-0 right-0 w-full bg-[#F2F4F5] rounded-t-3xl border-t border-gray-200 shadow-[0_-8px_24px_rgba(0,0,0,0.12)]"
      >
        <Sheet.Header unstyled className="cursor-grab active:cursor-grabbing touch-none">
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-9 h-1 rounded-full bg-gray-300" />
          </div>
        </Sheet.Header>
        <Sheet.Content disableDrag unstyled>
          {children}
        </Sheet.Content>
      </Sheet.Container>
    </Sheet>
  );
}
