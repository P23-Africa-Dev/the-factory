'use client';

import React, { useRef, useState } from 'react';
import { X, Camera, MapPin, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth';
import { useUploadTaskProof } from '@/hooks/use-tasks';

interface ProofUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: number | string;
  onSuccess: () => void;
}

export function ProofUploadModal({ isOpen, onClose, taskId, onSuccess }: ProofUploadModalProps) {
  const user = useAuthStore((s) => s.user);
  const companyId = user?.active_company?.id;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [gettingLocation, setGettingLocation] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { mutate: upload, isPending } = useUploadTaskProof({
    onSuccess: () => {
      toast.success('Proof uploaded successfully.');
      onSuccess();
      resetForm();
    },
  });

  const resetForm = () => {
    setFile(null);
    setPreview(null);
    setNotes('');
    setLatitude('');
    setLongitude('');
    setErrors({});
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(selected.type)) {
      setErrors((p) => ({ ...p, file: 'Only JPG, PNG, or WebP images are allowed.' }));
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setErrors((p) => ({ ...p, file: 'File must be under 10 MB.' }));
      return;
    }

    setFile(selected);
    setErrors((p) => ({ ...p, file: '' }));
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(selected);
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(String(pos.coords.latitude));
        setLongitude(String(pos.coords.longitude));
        setGettingLocation(false);
      },
      () => {
        toast.error('Could not get your location.');
        setGettingLocation(false);
      }
    );
  };

  const handleSubmit = () => {
    if (!file) {
      setErrors({ file: 'Please select a photo to upload.' });
      return;
    }
    if (!companyId) {
      toast.error('No active company context.');
      return;
    }

    upload({
      taskId,
      payload: {
        company_id: companyId,
        file,
        latitude: latitude ? Number(latitude) : undefined,
        longitude: longitude ? Number(longitude) : undefined,
        captured_at: new Date().toISOString(),
        notes: notes.trim() || undefined,
      },
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl z-10 flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 flex justify-between items-center border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-bold text-[16px] text-[#0B1215]">Upload Proof</h2>
            <p className="text-gray-400 text-xs mt-0.5">Attach a photo as proof for this task</p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* File picker */}
          <div>
            <label className="text-[11px] font-bold text-[#0B1215] uppercase tracking-wide block mb-2">
              Photo <span className="text-red-400">*</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
            {preview ? (
              <div className="relative rounded-2xl overflow-hidden aspect-video bg-gray-100">
                <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-all"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full aspect-video rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-gray-300 hover:bg-gray-50 transition-all"
              >
                <Camera size={28} className="text-gray-300" />
                <span className="text-[13px] font-medium">Click to select a photo</span>
                <span className="text-[11px]">JPG, PNG or WebP — max 10 MB</span>
              </button>
            )}
            {errors.file && <p className="text-red-400 text-[11px] mt-1">{errors.file}</p>}
          </div>

          {/* GPS */}
          <div>
            <label className="text-[11px] font-bold text-[#0B1215] uppercase tracking-wide block mb-2">
              Location{' '}
              <span className="text-gray-400 normal-case font-normal">(optional)</span>
            </label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                type="number"
                placeholder="Latitude"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-[#0B1215] outline-none focus:border-[#094B5C]"
              />
              <input
                type="number"
                placeholder="Longitude"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-[#0B1215] outline-none focus:border-[#094B5C]"
              />
            </div>
            <button
              onClick={handleGetLocation}
              disabled={gettingLocation}
              className="flex items-center gap-2 text-[12px] text-[#3A8C88] font-semibold hover:underline disabled:opacity-50"
            >
              {gettingLocation ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <MapPin size={13} />
              )}
              {gettingLocation ? 'Getting location…' : 'Use my current location'}
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] font-bold text-[#0B1215] uppercase tracking-wide block mb-2">
              Notes <span className="text-gray-400 normal-case font-normal">(optional)</span>
            </label>
            <textarea
              placeholder="e.g. Arrived at location, spoke with manager"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[13px] text-[#0B1215] outline-none focus:border-[#094B5C] resize-none placeholder:text-gray-300"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-0 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={isPending || !file}
            className="w-full py-3.5 bg-[#09232d] text-white rounded-2xl text-sm font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <CheckCircle size={15} />
            )}
            {isPending ? 'Uploading…' : 'Upload Proof'}
          </button>
        </div>
      </div>
    </div>
  );
}
