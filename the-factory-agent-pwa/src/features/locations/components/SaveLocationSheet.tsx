'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { SAVED_LOCATION_TYPES } from '@/lib/map/locationTypes';
import { saveLocationFormSchema } from '../schema';
import type { CreateSavedLocationInput } from '../types';

export type SaveLocationSheetProps = {
  visible: boolean;
  latitude: number;
  longitude: number;
  initialAddress?: string | null;
  initialName?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (input: CreateSavedLocationInput) => void;
};

export function SaveLocationSheet({
  visible,
  latitude,
  longitude,
  initialAddress,
  initialName,
  isSubmitting,
  onClose,
  onSubmit,
}: SaveLocationSheetProps) {
  const [name, setName] = useState(initialName ?? '');
  const [type, setType] = useState('office');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState(initialAddress ?? '');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!visible) return null;

  const handleSubmit = () => {
    const result = saveLocationFormSchema.safeParse({
      name,
      type,
      description,
      address,
      contactNumber,
      email,
    });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && !fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    onSubmit({
      name: name.trim(),
      type,
      description: description.trim() || null,
      address: address.trim() || null,
      latitude,
      longitude,
      contactNumber: contactNumber.trim() || null,
      email: email.trim() || null,
    });
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center font-sans">
      <div className="absolute inset-0 bg-[#051014]/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-[#0B3343] rounded-t-3xl border-t border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#0B3343] px-5 pt-5 pb-3 flex items-center justify-between border-b border-white/10">
          <h3 className="font-bold text-lg text-white">Save Location</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-300 hover:text-white"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#9FC4C6] mb-1.5">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lekki Distribution Hub"
              className="w-full bg-white rounded-xl px-3.5 py-3 text-sm text-[#09232D] font-semibold focus:outline-none focus:ring-2 focus:ring-[#75ADAF]"
            />
            {errors.name && <p className="text-[11px] text-[#FCA5A5] mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9FC4C6] mb-1.5">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-white rounded-xl px-3.5 py-3 text-sm text-[#09232D] font-semibold focus:outline-none focus:ring-2 focus:ring-[#75ADAF]"
            >
              {SAVED_LOCATION_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9FC4C6] mb-1.5">Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Auto-filled from map"
              className="w-full bg-white rounded-xl px-3.5 py-3 text-sm text-[#09232D] font-semibold focus:outline-none focus:ring-2 focus:ring-[#75ADAF]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9FC4C6] mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Notes about this place..."
              className="w-full bg-white rounded-xl px-3.5 py-3 text-sm text-[#09232D] font-semibold focus:outline-none focus:ring-2 focus:ring-[#75ADAF] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#9FC4C6] mb-1.5">Contact</label>
              <input
                type="tel"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="Phone"
                className="w-full bg-white rounded-xl px-3.5 py-3 text-sm text-[#09232D] font-semibold focus:outline-none focus:ring-2 focus:ring-[#75ADAF]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#9FC4C6] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full bg-white rounded-xl px-3.5 py-3 text-sm text-[#09232D] font-semibold focus:outline-none focus:ring-2 focus:ring-[#75ADAF]"
              />
              {errors.email && <p className="text-[11px] text-[#FCA5A5] mt-1">{errors.email}</p>}
            </div>
          </div>

          <p className="text-[11px] text-gray-400">
            Pinned at {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </p>

          <div className="flex gap-3 pt-1 pb-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 h-12 rounded-xl border border-white/30 text-white font-bold text-sm hover:bg-white/5 active:scale-95 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 h-12 rounded-xl bg-[#75ADAF] hover:bg-[#66989A] text-white font-bold text-sm active:scale-95 transition-all flex items-center justify-center disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                'Save Location'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
