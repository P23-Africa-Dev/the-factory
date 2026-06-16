'use client';

import React, { useState } from 'react';
import { DateTimePickerModal } from './DateTimePickerModal';

export type ReminderValue = { offsetMinutes?: number; customRemindAt?: string };

const PRESETS: Array<{ label: string; offsetMinutes: number }> = [
  { label: '5 min', offsetMinutes: 5 },
  { label: '15 min', offsetMinutes: 15 },
  { label: '30 min', offsetMinutes: 30 },
  { label: '1 hour', offsetMinutes: 60 },
  { label: '3 hours', offsetMinutes: 180 },
  { label: '1 day', offsetMinutes: 1440 },
  { label: '3 days', offsetMinutes: 4320 },
];

interface ReminderSectionProps {
  reminders: ReminderValue[];
  onChange: (reminders: ReminderValue[]) => void;
  meetingStart?: Date;
}

export function ReminderSection({ reminders, onChange, meetingStart }: ReminderSectionProps): React.ReactElement {
  const [customPickerOpen, setCustomPickerOpen] = useState(false);

  const selectedOffsets = new Set(
    reminders.filter((r) => r.offsetMinutes != null).map((r) => r.offsetMinutes),
  );

  const togglePreset = (offsetMinutes: number) => {
    if (selectedOffsets.has(offsetMinutes)) {
      onChange(reminders.filter((r) => r.offsetMinutes !== offsetMinutes));
    } else {
      onChange([...reminders, { offsetMinutes }]);
    }
  };

  const handleCustom = (date: Date) => {
    const iso = date.toISOString();
    const hasCustom = reminders.some((r) => r.customRemindAt != null);
    if (hasCustom) {
      onChange(reminders.map((r) => (r.customRemindAt != null ? { customRemindAt: iso } : r)));
    } else {
      onChange([...reminders, { customRemindAt: iso }]);
    }
  };

  const removeCustom = () => {
    onChange(reminders.filter((r) => r.customRemindAt == null));
  };

  const customReminder = reminders.find((r) => r.customRemindAt != null);

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-bold text-white uppercase tracking-wider">Reminders</h4>
      <span className="text-xs text-white/50">Preset reminders</span>

      {/* Presets Grid */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const active = selectedOffsets.has(p.offsetMinutes);
          return (
            <button
              key={p.offsetMinutes}
              type="button"
              onClick={() => togglePreset(p.offsetMinutes)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95 ${
                active
                  ? 'bg-[#FD6046] border-[#FD6046] text-white'
                  : 'bg-white/[0.08] border-white/10 text-white/60 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Custom reminder section */}
      <div className="mt-1">
        {customReminder ? (
          <div className="flex items-center gap-2 bg-[#FD6046] text-white px-4 py-2.5 rounded-xl border border-[#FD6046] text-xs font-semibold w-fit">
            <span>
              Custom:{' '}
              {new Date(customReminder.customRemindAt!).toLocaleString('en-NG', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              })}
            </span>
            <button
              type="button"
              onClick={removeCustom}
              className="text-white hover:text-white/80 p-0.5 text-sm focus:outline-none"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCustomPickerOpen(true)}
            className="w-full flex items-center justify-center py-3 border border-dashed border-[#75ADAF] hover:border-[#5DA1A3] rounded-xl text-xs font-semibold text-[#75ADAF] hover:text-[#5DA1A3] transition-colors focus:outline-none"
          >
            + Custom date & time
          </button>
        )}
      </div>

      <DateTimePickerModal
        visible={customPickerOpen}
        value={meetingStart ?? new Date()}
        onChange={handleCustom}
        onClose={() => setCustomPickerOpen(false)}
        title="Custom Reminder Time"
      />
    </div>
  );
}
