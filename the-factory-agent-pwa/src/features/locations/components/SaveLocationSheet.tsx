'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { SAVED_LOCATION_TYPES } from '@/lib/map/locationTypes';
import { useCrmLabels } from '@/features/crm';
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
  const { data: crmLabels = [] } = useCrmLabels();
  const defaultCrmStatus = crmLabels.find((l) => l.is_default)?.slug ?? crmLabels[0]?.slug ?? 'newly_lead';
  const [crmStatus, setCrmStatus] = useState(defaultCrmStatus);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!visible || !mounted) return null;

  const handleSubmit = (saveToCrm: boolean) => {
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
      saveToCrm,
      ...(saveToCrm ? { crmStatus } : {}),
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[60000] flex items-end justify-center font-sans">
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
              className="w-full h-12 bg-white rounded-xl px-4 text-[#09232D] placeholder-gray-400 focus:outline-none text-sm font-semibold border-none"
            />
            {errors.name && <p className="text-[#FD6046] text-[10px] mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9FC4C6] mb-1.5">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full h-12 bg-white rounded-xl px-4 text-[#09232D] focus:outline-none text-sm font-semibold border-none appearance-none cursor-pointer"
            >
              {SAVED_LOCATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
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
              className="w-full h-12 bg-white rounded-xl px-4 text-[#09232D] placeholder-gray-400 focus:outline-none text-sm font-semibold border-none"
            />
            {errors.address && <p className="text-[#FD6046] text-[10px] mt-1">{errors.address}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9FC4C6] mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes about this place..."
              rows={3}
              className="w-full bg-white rounded-xl p-4 text-[#09232D] placeholder-gray-400 focus:outline-none text-sm font-semibold border-none resize-none"
            />
            {errors.description && (
              <p className="text-[#FD6046] text-[10px] mt-1">{errors.description}</p>
            )}
          </div>

          <div className="flex gap-4">
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-[#9FC4C6] mb-1.5">Contact</label>
              <input
                type="text"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="e.g. +234..."
                className="w-full h-12 bg-white rounded-xl px-4 text-[#09232D] placeholder-gray-400 focus:outline-none text-sm font-semibold border-none"
              />
              {errors.contactNumber && (
                <p className="text-[#FD6046] text-[10px] mt-1">{errors.contactNumber}</p>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-[#9FC4C6] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. name@..."
                className="w-full h-12 bg-white rounded-xl px-4 text-[#09232D] placeholder-gray-400 focus:outline-none text-sm font-semibold border-none"
              />
              {errors.email && <p className="text-[#FD6046] text-[10px] mt-1">{errors.email}</p>}
            </div>
          </div>

          {/* CRM Label Selection Option */}
          <div className="flex items-center gap-2 py-1 select-none">
            <input
              type="checkbox"
              id="saveToCrm"
              className="h-4 w-4 rounded border-white/20 bg-white/5 text-[#75ADAF] focus:ring-0 focus:ring-offset-0 cursor-pointer"
              checked={type === 'lead'}
              onChange={(e) => setType(e.target.checked ? 'lead' : 'office')}
            />
            <label htmlFor="saveToCrm" className="text-xs font-semibold text-white cursor-pointer">
              Also save as a CRM Lead
            </label>
          </div>

          {type === 'lead' && (
            <div>
              <label className="block text-xs font-semibold text-[#9FC4C6] mb-1.5 flex justify-between items-center">
                <span>CRM Lead Status</span>
                {crmLabels.length === 0 && (
                  <span className="text-[10px] text-gray-400 normal-case font-normal animate-pulse">
                    Loading labels...
                  </span>
                )}
              </label>
              <select
                value={crmStatus}
                onChange={(e) => setCrmStatus(e.target.value)}
                className="w-full h-12 bg-white rounded-xl px-4 text-[#09232D] focus:outline-none text-sm font-semibold border-none appearance-none cursor-pointer"
              >
                {crmLabels.map((label) => (
                  <option key={label.slug} value={label.slug}>
                    {label.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1 pb-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full h-11 rounded-xl border border-white/30 text-white font-semibold text-sm hover:bg-white/5 active:scale-95 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={isSubmitting}
              className="w-full h-12 rounded-xl border border-[#75ADAF]/50 text-[#75ADAF] font-bold text-sm active:scale-95 transition-all flex items-center justify-center disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#75ADAF] border-t-transparent" />
              ) : (
                'Save on Map Only'
              )}
            </button>
            <button
              type="button"
              onClick={() => handleSubmit(true)}
              disabled={isSubmitting}
              className="w-full h-12 rounded-xl bg-[#75ADAF] hover:bg-[#66989A] text-white font-bold text-sm active:scale-95 transition-all flex items-center justify-center disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                'Save on Map & CRM'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
