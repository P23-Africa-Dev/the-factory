'use client';

import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DateTimePickerModal } from './DateTimePickerModal';
import { AttendeeSection } from './AttendeeSection';
import { ReminderSection } from './ReminderSection';
import { CalendarStatusNotice } from './CalendarStatusNotice';
import { useAttendeeCandidates, useCalendarStatus } from '../queries';
import type { MeetingFormValues, AttendeeCandidate } from '../types';

const TIMEZONES = [
  'Africa/Lagos',
  'Africa/Accra',
  'Africa/Nairobi',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Dubai',
];

const formSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(255),
  description: z.string().max(5000).optional(),
  location: z.string().max(255).optional(),
  timezone: z.string().min(1),
});

type FormFields = z.infer<typeof formSchema>;

interface MeetingFormProps {
  initialValues?: Partial<MeetingFormValues>;
  onSubmit: (values: MeetingFormValues) => Promise<void>;
  isSubmitting: boolean;
  submitLabel: string;
  serverErrors?: Record<string, string[]>;
}

export function MeetingForm({
  initialValues,
  onSubmit,
  isSubmitting,
  submitLabel,
  serverErrors,
}: MeetingFormProps): React.ReactElement {
  const deviceTz = typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'Africa/Lagos';
  const defaultTz = TIMEZONES.includes(deviceTz) ? deviceTz : 'Africa/Lagos';

  const [startDate, setStartDate] = useState<Date>(() => {
    if (initialValues?.startDate) return new Date(initialValues.startDate);
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d;
  });
  const [endDate, setEndDate] = useState<Date>(() => {
    if (initialValues?.endDate) return new Date(initialValues.endDate);
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 2);
    return d;
  });
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);
  const [dateError, setDateError] = useState('');

  const [internalAttendees, setInternalAttendees] = useState<MeetingFormValues['internalAttendees']>(
    initialValues?.internalAttendees ?? [],
  );
  const [externalAttendees, setExternalAttendees] = useState<MeetingFormValues['externalAttendees']>(
    initialValues?.externalAttendees ?? [],
  );
  const [reminders, setReminders] = useState<MeetingFormValues['reminders']>(
    initialValues?.reminders ?? [],
  );

  const { data: candidates = [], isLoading: isLoadingCandidates } = useAttendeeCandidates();
  const { data: calendarStatus } = useCalendarStatus();

  const { control, handleSubmit, formState: { errors }, setError } = useForm<FormFields>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: initialValues?.title ?? '',
      description: initialValues?.description ?? '',
      location: initialValues?.location ?? '',
      timezone: initialValues?.timezone ?? defaultTz,
    },
  });

  // Map server-side field errors into react-hook-form
  useEffect(() => {
    if (!serverErrors) return;
    (Object.entries(serverErrors) as [keyof FormFields, string[]][]).forEach(([field, msgs]) => {
      setError(field, { message: msgs[0] });
    });
  }, [serverErrors, setError]);

  const formatDateTime = (d: Date): string =>
    d.toLocaleString('en-NG', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

  const handleFormSubmit = handleSubmit(async (fields) => {
    if (endDate <= startDate) {
      setDateError('End time must be after start time');
      return;
    }
    setDateError('');
    await onSubmit({
      title: fields.title,
      description: fields.description ?? '',
      location: fields.location ?? '',
      timezone: fields.timezone,
      startDate,
      endDate,
      reminders,
      internalAttendees,
      externalAttendees,
    });
  });

  const calendarBlocked = calendarStatus && (!calendarStatus.connected || calendarStatus.status !== 'active');

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleFormSubmit(); }} className="flex flex-col gap-5 text-white">
      {calendarStatus && <CalendarStatusNotice calendarStatus={calendarStatus} />}

      {/* Title */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Title *</label>
        <Controller
          control={control}
          name="title"
          render={({ field: { onChange, value } }) => (
            <input
              type="text"
              placeholder="Meeting title"
              value={value}
              onChange={onChange}
              className={`bg-white/[0.08] text-white text-sm border focus:outline-none focus:border-[#44AFCD]/50 rounded-xl px-4 py-2.5 transition-all placeholder-white/30 ${
                errors.title ? 'border-red-500' : 'border-white/15'
              }`}
            />
          )}
        />
        {errors.title && <span className="text-xs text-red-500 font-semibold">{errors.title.message}</span>}
      </div>

      {/* Description */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Description</label>
        <Controller
          control={control}
          name="description"
          render={({ field: { onChange, value } }) => (
            <textarea
              placeholder="What is this meeting about?"
              value={value}
              onChange={onChange}
              rows={3}
              className="bg-white/[0.08] text-white text-sm border border-white/15 focus:outline-none focus:border-[#44AFCD]/50 rounded-xl px-4 py-2.5 transition-all placeholder-white/30 resize-none"
            />
          )}
        />
      </div>

      {/* Location */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Location</label>
        <Controller
          control={control}
          name="location"
          render={({ field: { onChange, value } }) => (
            <input
              type="text"
              placeholder="Physical location or meeting link"
              value={value}
              onChange={onChange}
              className="bg-white/[0.08] text-white text-sm border border-white/15 focus:outline-none focus:border-[#44AFCD]/50 rounded-xl px-4 py-2.5 transition-all placeholder-white/30"
            />
          )}
        />
      </div>

      {/* Date & Time Picker Triggers */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Start *</label>
          <div
            onClick={() => setStartPickerOpen(true)}
            className="flex items-center justify-between bg-white/[0.08] border border-white/15 rounded-xl px-4 py-3 cursor-pointer text-sm text-white/95 hover:bg-white/[0.12] transition-all"
          >
            <span>{formatDateTime(startDate)}</span>
            <span>📅</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">End *</label>
          <div
            onClick={() => setEndPickerOpen(true)}
            className="flex items-center justify-between bg-white/[0.08] border border-white/15 rounded-xl px-4 py-3 cursor-pointer text-sm text-white/95 hover:bg-white/[0.12] transition-all"
          >
            <span>{formatDateTime(endDate)}</span>
            <span>📅</span>
          </div>
          {dateError && <span className="text-xs text-red-500 font-semibold">{dateError}</span>}
        </div>
      </div>

      {/* Timezone */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Timezone *</label>
        <Controller
          control={control}
          name="timezone"
          render={({ field: { onChange, value } }) => (
            <div className="relative">
              <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-[#0A1D25] text-white text-sm border border-white/15 focus:outline-none focus:border-[#44AFCD]/50 rounded-xl px-4 py-3 transition-all [color-scheme:dark]"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          )}
        />
      </div>

      {/* Attendees Section */}
      <div className="border-t border-white/10 pt-4 mt-2">
        <AttendeeSection
          candidates={candidates}
          isLoadingCandidates={isLoadingCandidates}
          internalAttendees={internalAttendees}
          externalAttendees={externalAttendees}
          onAddInternal={(c: AttendeeCandidate) => {
            if (!internalAttendees.find((a) => a.id === c.id)) {
              setInternalAttendees((prev) => [...prev, { id: c.id, name: c.name, email: c.email, isOptional: false }]);
            }
          }}
          onRemoveInternal={(id) => setInternalAttendees((prev) => prev.filter((a) => a.id !== id))}
          onAddExternal={(email, displayName) => {
            if (!externalAttendees.find((a) => a.email === email)) {
              setExternalAttendees((prev) => [...prev, { email, displayName, isOptional: false }]);
            }
          }}
          onRemoveExternal={(email) => setExternalAttendees((prev) => prev.filter((a) => a.email !== email))}
        />
      </div>

      {/* Reminders Section */}
      <div className="border-t border-white/10 pt-4 mt-2">
        <ReminderSection reminders={reminders} onChange={setReminders} meetingStart={startDate} />
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting || calendarBlocked}
        className="w-full h-12 flex items-center justify-center bg-[#FD6046] hover:bg-[#E0533C] text-white text-sm font-semibold rounded-xl active:scale-95 transition-all mt-4 disabled:opacity-50"
      >
        {isSubmitting ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          submitLabel
        )}
      </button>

      {/* Datetime Pickers */}
      <DateTimePickerModal
        visible={startPickerOpen}
        value={startDate}
        onChange={(d) => {
          setStartDate(d);
          if (d >= endDate) {
            setEndDate(new Date(d.getTime() + 3600000));
          }
        }}
        onClose={() => setStartPickerOpen(false)}
        title="Start Date & Time"
      />
      <DateTimePickerModal
        visible={endPickerOpen}
        value={endDate}
        onChange={setEndDate}
        onClose={() => setEndPickerOpen(false)}
        title="End Date & Time"
        minimumDate={startDate}
      />
    </form>
  );
}
