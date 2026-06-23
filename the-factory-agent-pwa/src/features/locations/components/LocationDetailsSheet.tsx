'use client';

import React from 'react';
import { X, MapPin, Phone, Mail, Navigation } from 'lucide-react';
import { getSavedLocationType } from '@/lib/map/locationTypes';
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
  if (!location) return null;

  const typeOption = getSavedLocationType(location.type);

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center font-sans">
      <div className="absolute inset-0 bg-[#051014]/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-[#0B3343] rounded-t-3xl border-t border-white/10 shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#0B3343] px-5 pt-5 pb-3 flex items-start justify-between border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: typeOption.color }}
            />
            <div className="min-w-0">
              <h3 className="font-bold text-lg text-white truncate">{location.name}</h3>
              <p className="text-xs text-[#9FC4C6] font-semibold">{typeOption.label}</p>
              {location.linkedToCrm && (
                <p className="text-[10px] text-[#75ADAF] font-semibold mt-0.5">Also in CRM lead bank</p>
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

        <div className="px-5 py-4 flex flex-col gap-3.5 text-white">
          {location.address && (
            <div className="flex items-start gap-3">
              <MapPin size={18} className="text-[#75ADAF] flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-200">{location.address}</p>
            </div>
          )}

          {location.description && (
            <p className="text-sm text-gray-300 bg-white/5 rounded-xl p-3">
              {location.description}
            </p>
          )}

          {location.contactNumber && (
            <div className="flex items-center gap-3">
              <Phone size={16} className="text-[#75ADAF] flex-shrink-0" />
              <a href={`tel:${location.contactNumber}`} className="text-sm text-gray-200">
                {location.contactNumber}
              </a>
            </div>
          )}

          {location.email && (
            <div className="flex items-center gap-3">
              <Mail size={16} className="text-[#75ADAF] flex-shrink-0" />
              <a href={`mailto:${location.email}`} className="text-sm text-gray-200 truncate">
                {location.email}
              </a>
            </div>
          )}

          <p className="text-[11px] text-gray-400">
            {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
            {location.createdByName ? ` · Added by ${location.createdByName}` : ''}
          </p>

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
    </div>
  );
}
