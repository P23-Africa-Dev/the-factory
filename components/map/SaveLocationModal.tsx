"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Loader2, Mail, MapPin, Phone, X } from "lucide-react";

import { SAVED_LOCATION_TYPES } from "@/lib/map/location-types";
import type { SavedLocation } from "@/lib/api/saved-locations";

export type SaveLocationFormValues = {
  name: string;
  type: string;
  description: string;
  address: string;
  contact_number: string;
  email: string;
};

export type SaveLocationSubmitPayload = SaveLocationFormValues & {
  latitude: number;
  longitude: number;
};

interface SaveLocationModalProps {
  open: boolean;
  mode: "create" | "edit";
  latitude: number;
  longitude: number;
  /** Auto-filled address (reverse geocoded) or existing address. */
  address: string;
  addressLoading?: boolean;
  initial?: SavedLocation | null;
  busy?: boolean;
  onSubmit: (payload: SaveLocationSubmitPayload) => void;
  onClose: () => void;
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-[11px] font-bold text-[#0B1215] uppercase tracking-wide block mb-1.5">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

const BASE_INPUT =
  "w-full bg-gray-50 rounded-xl text-sm text-[#0B1215] outline-none border transition-colors placeholder:text-gray-300";

export function SaveLocationModal({
  open,
  mode,
  latitude,
  longitude,
  address,
  addressLoading = false,
  initial,
  busy = false,
  onSubmit,
  onClose,
}: SaveLocationModalProps) {
  // The parent remounts this modal (via `key`) when the target changes, so a
  // lazy initializer is sufficient for resetting the form on open.
  const [values, setValues] = useState<SaveLocationFormValues>(() => ({
    name: initial?.name ?? "",
    type: initial?.type ?? "office",
    description: initial?.description ?? "",
    address: initial?.address ?? "",
    contact_number: initial?.contact_number ?? "",
    email: initial?.email ?? "",
  }));
  const [addressDirty, setAddressDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const title = mode === "create" ? "Save Location" : "Edit Location";

  // In create mode the address resolves asynchronously; show the resolved value
  // until the user edits it, without an effect.
  const addressValue = addressDirty ? values.address : values.address || address;

  if (!open || typeof document === "undefined") return null;

  const handleChange = (field: keyof SaveLocationFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!values.name.trim()) next.name = "Name is required.";
    if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      next.email = "Enter a valid email.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    if (busy) return;
    if (!validate()) return;
    onSubmit({
      ...values,
      name: values.name.trim(),
      address: addressValue,
      latitude,
      longitude,
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#094B5C]/10 text-[#094B5C]">
              <MapPin size={18} />
            </span>
            <h3 className="text-[17px] font-bold text-[#0B1215]">{title}</h3>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <FieldLabel required>Location Name</FieldLabel>
            <input
              value={values.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="e.g. Lagos Head Office"
              className={`${BASE_INPUT} px-3 py-2.5 ${errors.name ? "border-red-300" : "border-gray-200 focus:border-[#094B5C]"}`}
            />
            {errors.name && <p className="mt-1 text-[11px] text-red-500">{errors.name}</p>}
          </div>

          <div>
            <FieldLabel>Type</FieldLabel>
            <div className="relative">
              <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                value={values.type}
                onChange={(e) => handleChange("type", e.target.value)}
                className={`${BASE_INPUT} pl-9 pr-3 py-2.5 border-gray-200 focus:border-[#094B5C] appearance-none`}
              >
                {SAVED_LOCATION_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <FieldLabel>Address</FieldLabel>
            <div className="relative">
              <input
                value={addressValue}
                onChange={(e) => {
                  setAddressDirty(true);
                  handleChange("address", e.target.value);
                }}
                placeholder={addressLoading ? "Resolving address…" : "Auto-filled from map"}
                className={`${BASE_INPUT} px-3 py-2.5 border-gray-200 focus:border-[#094B5C]`}
              />
              {addressLoading && (
                <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
              )}
            </div>
            <p className="mt-1 text-[10px] text-gray-400">
              {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Contact Number</FieldLabel>
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  value={values.contact_number}
                  onChange={(e) => handleChange("contact_number", e.target.value)}
                  placeholder="+234…"
                  className={`${BASE_INPUT} pl-9 pr-3 py-2.5 border-gray-200 focus:border-[#094B5C]`}
                />
              </div>
            </div>
            <div>
              <FieldLabel>Email</FieldLabel>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  value={values.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  placeholder="name@org.com"
                  className={`${BASE_INPUT} pl-9 pr-3 py-2.5 ${errors.email ? "border-red-300" : "border-gray-200 focus:border-[#094B5C]"}`}
                />
              </div>
              {errors.email && <p className="mt-1 text-[11px] text-red-500">{errors.email}</p>}
            </div>
          </div>

          <div>
            <FieldLabel>Description</FieldLabel>
            <textarea
              value={values.description}
              onChange={(e) => handleChange("description", e.target.value)}
              rows={3}
              placeholder="Optional notes about this location"
              className={`${BASE_INPUT} px-3 py-2.5 border-gray-200 focus:border-[#094B5C] resize-none`}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2.5 rounded-full text-sm font-semibold text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={busy}
            className="px-6 py-2.5 rounded-full text-sm font-bold text-white bg-gradient-to-r from-[#094B5C] to-[#0A7E8C] hover:opacity-90 flex items-center gap-2 disabled:opacity-60"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {mode === "create" ? "Save Location" : "Update Location"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
