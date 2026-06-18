'use client';

import React, { useState, useEffect } from 'react';

interface DateTimePickerModalProps {
  visible: boolean;
  value: Date;
  onChange: (date: Date) => void;
  onClose: () => void;
  title?: string;
  minimumDate?: Date;
}

// Convert Date object to YYYY-MM-DDTHH:MM local string format for HTML datetime-local input
function formatDateForInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
}

export function DateTimePickerModal({
  visible,
  value,
  onChange,
  onClose,
  title = 'Select Date & Time',
  minimumDate,
}: DateTimePickerModalProps): React.ReactElement | null {
  const [tempValue, setTempValue] = useState('');

  useEffect(() => {
    if (visible && value) {
      setTimeout(() => setTempValue(formatDateForInput(value)), 0);
    }
  }, [visible, value]);

  if (!visible) return null;

  const handleConfirm = () => {
    if (tempValue) {
      onChange(new Date(tempValue));
    }
    onClose();
  };

  const minDateStr = minimumDate ? formatDateForInput(minimumDate) : undefined;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer" />

      {/* Card */}
      <div className="relative bg-[#0A1D25] border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl z-10 flex flex-col gap-4 font-sans select-none text-white">
        <h3 className="text-center font-bold text-sm text-white uppercase tracking-wider">{title}</h3>

        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-wide">Date & Time</label>
          <input
            type="datetime-local"
            value={tempValue}
            min={minDateStr}
            onChange={(e) => setTempValue(e.target.value)}
            className="w-full bg-white/[0.08] text-white text-sm border border-white/15 focus:border-[#44AFCD]/50 rounded-xl px-4 py-3 focus:outline-none transition-all [color-scheme:dark]"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-2">
          <button
            onClick={onClose}
            className="flex-1 h-11 border border-white/10 rounded-xl text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 active:scale-95 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 h-11 bg-[#FD6046] hover:bg-[#E0533C] rounded-xl text-xs font-semibold text-white active:scale-95 transition-all"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
