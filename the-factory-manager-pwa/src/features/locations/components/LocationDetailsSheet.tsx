'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Mail, MapPin, Navigation, Phone, X } from 'lucide-react';
import { useBottomNavVisibility } from '@/components/shared/BottomNavVisibility';
import { getSavedLocationType, getSavedLocationTypeLabel } from '@/lib/map/locationTypes';
import { SavedLocationTypeIcon } from '@/features/locations/components/SavedLocationTypeIcon';
import type { SavedLocation } from '../types';

export type LocationDetailsSheetProps = {
  location: SavedLocation | null;
  onClose: () => void;
  onNavigate?: (location: SavedLocation) => void;
};

export function LocationDetailsSheet({
  location,
  onClose,
  onNavigate,
}: LocationDetailsSheetProps) {
  const { hide, show } = useBottomNavVisibility();

  useEffect(() => {
    if (!location) return;
    hide();
    return () => show();
  }, [location, hide, show]);

  if (!location) return null;

  const typeOption = getSavedLocationType(location.type);
  const typeLabel = getSavedLocationTypeLabel(location.type);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center font-sans">
      <div className="absolute inset-0 bg-[#051014]/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-[#0B3343] rounded-t-3xl border-t border-white/10 shadow-2xl max-h-[85vh] overflow-y-auto pb-[env(safe-area-inset-bottom,0px)]">
        <div className="sticky top-0 bg-[#0B3343] px-5 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shrink-0 shadow-md"
                style={{ backgroundColor: typeOption.color }}
              >
                <SavedLocationTypeIcon type={location.type} size={22} className="text-white" />
              </span>
              <div className="min-w-0">
                <h3 className="font-bold text-lg text-white leading-tight">{location.name}</h3>
                <p className="text-xs font-semibold mt-0.5" style={{ color: typeOption.color }}>
                  {typeLabel}
                </p>
                {location.linkedToCrm && (
                  <p className="text-[10px] text-[#75ADAF] font-semibold mt-1">Also in CRM lead bank</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-300 hover:text-white flex-shrink-0"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3.5 text-white">
          {location.address && (
            <div className="flex items-start gap-3 rounded-2xl bg-white/5 px-3.5 py-3">
              <MapPin size={18} className="text-[#75ADAF] flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-200 leading-relaxed">{location.address}</p>
            </div>
          )}

          {location.description && (
            <p className="text-sm text-gray-300 bg-white/5 rounded-2xl px-3.5 py-3 leading-relaxed">
              {location.description}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {location.contactNumber && (
              <a
                href={`tel:${location.contactNumber}`}
                className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3.5 py-3 hover:bg-white/10 transition-colors"
              >
                <Phone size={16} className="text-[#75ADAF] shrink-0" />
                <span className="text-sm text-gray-200 truncate">{location.contactNumber}</span>
              </a>
            )}
            {location.email && (
              <a
                href={`mailto:${location.email}`}
                className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3.5 py-3 hover:bg-white/10 transition-colors"
              >
                <Mail size={16} className="text-[#75ADAF] shrink-0" />
                <span className="text-sm text-gray-200 truncate">{location.email}</span>
              </a>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-gray-400">
            <Clock size={12} className="shrink-0" />
            <span>
              {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
              {location.createdByName ? ` · Added by ${location.createdByName}` : ''}
              {location.createdAt
                ? ` · ${new Date(location.createdAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}`
                : ''}
            </span>
          </div>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate(location)}
              className="mt-1 h-12 rounded-xl bg-[#75ADAF] hover:bg-[#66989A] text-white font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Navigation size={16} />
              Navigate here
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
