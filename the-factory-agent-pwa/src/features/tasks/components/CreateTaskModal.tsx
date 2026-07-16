'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  MapPin,
  Calendar,
  AlertCircle,
  Plus,
  Trash2,
  Navigation,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import { useCreateSelfTask } from '../queries';
import { PlaceAutocompleteField } from '@/features/locations/components/PlaceAutocompleteField';
import type { RetrievedPlace } from '@/lib/map/place-search';
import { reverseGeocode } from '@/lib/map/reverseGeocode';
import { toast } from '@/lib/toast';
import { useAgentIdentity } from '@/features/auth';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TASK_TYPES = [
  { value: 'sales_visit', label: 'Sales Visit' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'collection', label: 'Collection' },
  { value: 'awareness', label: 'Customer Awareness' },
] as const;

const PRIORITIES = [
  { value: 'low', label: 'Low', color: '#10B981', bg: '#10B98115' },
  { value: 'medium', label: 'Medium', color: '#F59E0B', bg: '#F59E0B15' },
  { value: 'high', label: 'High', color: '#EF4444', bg: '#EF444415' },
  { value: 'urgent', label: 'Urgent', color: '#7C3AED', bg: '#7C3AED15' },
] as const;

export function CreateTaskModal({ isOpen, onClose }: CreateTaskModalProps) {
  const { mutate: createSelfTask, isPending } = useCreateSelfTask();
  const { userRole } = useAgentIdentity();
  const isOwnerOrSupervisor = userRole === 'owner' || userRole === 'supervisor';

  // Form states
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'sales_visit' | 'inspection' | 'delivery' | 'collection' | 'awareness'>('sales_visit');
  const [description, setDescription] = useState('');
  const [locationName, setLocationName] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [dueDate, setDueDate] = useState('');
  const [visitVerification, setVisitVerification] = useState(false);
  const [minPhotos, setMinPhotos] = useState(0);

  // Required actions list builder
  const [actionInput, setActionInput] = useState('');
  const [requiredActions, setRequiredActions] = useState<string[]>([]);

  // Geocoding and GPS states
  const [gpsLocating, setGpsLocating] = useState(false);

  // Default due date to end of today (23:59) local time
  useEffect(() => {
    if (isOpen) {
      const today = new Date();
      today.setHours(23, 59, 0, 0);
      
      // Format as YYYY-MM-DDThh:mm for datetime-local input
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const hours = String(today.getHours()).padStart(2, '0');
      const minutes = String(today.getMinutes()).padStart(2, '0');
      
      // eslint-disable-next-line react-hooks/set-state-in-effect -- default due date when modal opens
      setDueDate(`${year}-${month}-${day}T${hours}:${minutes}`);
    }
  }, [isOpen]);

  const handleAddAction = () => {
    const trimmed = actionInput.trim();
    if (trimmed && !requiredActions.includes(trimmed)) {
      setRequiredActions((prev) => [...prev, trimmed]);
      setActionInput('');
    }
  };

  const handleRemoveAction = (index: number) => {
    setRequiredActions((prev) => prev.filter((_, i) => i !== index));
  };

  const applyRetrievedPlace = (place: RetrievedPlace) => {
    setLocationName(place.name);
    setAddress(place.address || place.name);
    setCoords({ lat: place.lat, lng: place.lng });
  };

  // 10x GPS coordinates loader
  const handleGPSLocate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('GPS tracking is not supported by your browser.');
      return;
    }
    setGpsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        
        toast.info('GPS locked. Fetching address...');
        const resolvedAddress = await reverseGeocode(longitude, latitude);
        if (resolvedAddress) {
          setAddress(resolvedAddress);
          if (!locationName) {
            setLocationName(resolvedAddress.split(',')[0] || 'Current Location');
          }
        } else {
          setAddress(`GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        }
        setGpsLocating(false);
      },
      (err) => {
        console.error(err);
        toast.error('Failed to retrieve location from GPS.');
        setGpsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Task title is required.');
      return;
    }
    if (visitVerification && !coords) {
      toast.error('Visit verification requires GPS coordinates. Please search or use GPS location.');
      return;
    }

    const payload = {
      title,
      type,
      description: description || undefined,
      location: locationName || undefined,
      address: address || undefined,
      latitude: coords?.lat ?? undefined,
      longitude: coords?.lng ?? undefined,
      due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
      priority,
      required_actions: requiredActions.length > 0 ? requiredActions : undefined,
      minimum_photos_required: minPhotos || undefined,
      visit_verification_required: visitVerification,
    };

    createSelfTask(payload, {
      onSuccess: () => {
        handleReset();
        onClose();
      },
      onError: (err: unknown) => {
        const apiErr = err as { message?: string; errors?: Record<string, string[] | string> };
        let msg = apiErr?.message || 'Failed to create task.';
        if (apiErr?.errors && typeof apiErr.errors === 'object') {
          const validationMsgs = Object.values(apiErr.errors)
            .flat()
            .filter((m): m is string => typeof m === 'string');
          if (validationMsgs.length > 0) {
            msg = validationMsgs.join('\n');
          }
        }
        toast.error(msg);
      },
    });
  };

  const handleReset = () => {
    setTitle('');
    setType('sales_visit');
    setDescription('');
    setLocationName('');
    setAddress('');
    setCoords(null);
    setPriority('medium');
    setRequiredActions([]);
    setVisitVerification(false);
    setMinPhotos(0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Sheet */}
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative w-full max-w-lg bg-[#0B1E26]/95 border border-white/10 rounded-t-[24px] sm:rounded-[24px] p-6 max-h-[85vh] sm:max-h-[90vh] flex flex-col text-white z-10 overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-white/5 shrink-0 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white font-sans">Create Daily Task</h2>
            <p className="text-[10px] text-white/40 mt-0.5">Add a task to your operations log</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pr-1 scrollbar-none space-y-4 pb-2">
          {/* Task Title */}
          <div className="flex flex-col">
            <label className="text-[10px] text-white/50 tracking-wider font-bold mb-1 uppercase font-sans">
              Task Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Deliver items to client"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#75ADAF]/60 transition-colors"
            />
          </div>

          {/* Task Type */}
          <div className="flex flex-col">
            <label className="text-[10px] text-white/50 tracking-wider font-bold mb-1 uppercase font-sans">
              Task Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="bg-[#0B1E26] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#75ADAF]/60 transition-colors"
            >
              {TASK_TYPES.map((t) => (
                <option key={t.value} value={t.value} className="bg-[#0B1E26] text-white">
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div className="flex flex-col">
            <label className="text-[10px] text-white/50 tracking-wider font-bold mb-1 uppercase font-sans">
              Description
            </label>
            <textarea
              placeholder="e.g., Review contract details and collect invoice."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#75ADAF]/60 transition-colors resize-none"
            />
          </div>

          {/* Priority Picker */}
          <div className="flex flex-col">
            <label className="text-[10px] text-white/50 tracking-wider font-bold mb-1.5 uppercase font-sans">
              Priority
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PRIORITIES.map((p) => {
                const isActive = priority === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className="py-2 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center cursor-pointer"
                    style={{
                      borderColor: isActive ? p.color : 'rgba(255, 255, 255, 0.1)',
                      backgroundColor: isActive ? p.bg : 'rgba(255, 255, 255, 0.02)',
                      color: isActive ? p.color : 'rgba(255, 255, 255, 0.6)',
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Location & Address Autocomplete */}
          <div className="grid grid-cols-1 gap-3 border-t border-white/5 pt-3">
            <div className="relative flex flex-col">
              <label className="text-[10px] text-white/50 tracking-wider font-bold mb-1 uppercase font-sans">
                Location Name
              </label>
              <PlaceAutocompleteField
                value={locationName}
                onChange={(next) => {
                  setLocationName(next);
                  setCoords(null);
                }}
                onPlaceSelect={applyRetrievedPlace}
                placeholder="e.g., Shoprite Mall"
                variant="dark"
                inputClassName="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#75ADAF]/60 transition-colors placeholder:text-white/30"
              />
            </div>

            <div className="relative flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-white/50 tracking-wider font-bold uppercase font-sans">
                  Address
                </label>
                <button
                  type="button"
                  onClick={handleGPSLocate}
                  disabled={gpsLocating}
                  className="flex items-center gap-1 text-[9px] font-bold text-[#75ADAF] hover:text-[#88c5c7] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {gpsLocating ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <Navigation size={10} />
                  )}
                  Locate Me
                </button>
              </div>
              <PlaceAutocompleteField
                value={address}
                onChange={(next) => {
                  setAddress(next);
                  setCoords(null);
                }}
                onPlaceSelect={applyRetrievedPlace}
                placeholder="e.g., 24 Admiralty Way, Lekki Phase 1"
                variant="dark"
                inputClassName="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#75ADAF]/60 transition-colors placeholder:text-white/30"
              />
              {coords ? (
                <p className="text-[9px] text-green-400 mt-1 font-semibold flex items-center gap-1 font-sans">
                  <CheckCircle size={10} /> Coordinates: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </p>
              ) : (address.trim().length >= 2 || locationName.trim().length >= 2) ? (
                <p className="text-[9px] text-amber-300 mt-1 font-sans">
                  Pick a suggestion to lock map coordinates for arrival detection.
                </p>
              ) : null}
            </div>
          </div>

          {/* Due Date */}
          <div className="flex flex-col">
            <label className="text-[10px] text-white/50 tracking-wider font-bold mb-1 uppercase font-sans">
              Due Date & Time
            </label>
            <div className="relative">
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#75ADAF]/60 transition-colors"
              />
            </div>
          </div>

          {/* Required Actions Checklist */}
          <div className="flex flex-col border-t border-white/5 pt-3">
            <label className="text-[10px] text-white/50 tracking-wider font-bold mb-1 uppercase font-sans">
              Add Required Checklist Items (optional)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g., Take shopfront photo"
                value={actionInput}
                onChange={(e) => setActionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddAction();
                  }
                }}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-[#75ADAF]/60"
              />
              <button
                type="button"
                onClick={handleAddAction}
                className="w-9 h-9 rounded-xl bg-[#75ADAF]/20 hover:bg-[#75ADAF]/30 text-[#75ADAF] flex items-center justify-center transition-colors cursor-pointer"
              >
                <Plus size={16} />
              </button>
            </div>
            {requiredActions.length > 0 && (
              <div className="mt-2.5 p-2.5 bg-white/[0.02] border border-white/5 rounded-xl space-y-1.5 max-h-32 overflow-y-auto scrollbar-none">
                {requiredActions.map((action, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                    <span className="text-[11px] text-white/80 font-sans">{action}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAction(idx)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Advanced Toggles */}
          {isOwnerOrSupervisor && (
            <div className="border-t border-white/5 pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-[11px] font-bold text-white font-sans block">Visit Verification</label>
                  <span className="text-[9px] text-white/40 block leading-tight">Requires matching agent location on arrival</span>
                </div>
                <input
                  type="checkbox"
                  checked={visitVerification}
                  onChange={(e) => setVisitVerification(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#75ADAF] cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-[11px] font-bold text-white font-sans block">Photo Proof Requirement</label>
                  <span className="text-[9px] text-white/40 block leading-tight">Minimum proof images to upload on completion</span>
                </div>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={minPhotos}
                  onChange={(e) => setMinPhotos(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-14 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white text-center outline-none focus:border-[#75ADAF]/60"
                />
              </div>
            </div>
          )}

          {/* Submit Action */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="w-full h-11 bg-[#75ADAF] hover:bg-[#85bec0] text-white font-semibold text-xs rounded-xl flex items-center justify-center shadow-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isPending ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                'Create Task'
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
