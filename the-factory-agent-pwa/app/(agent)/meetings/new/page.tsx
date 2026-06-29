'use client';

import React, { useState } from 'react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import { useCreateMeeting, useCalendarStatus } from '@/features/meetings/queries';
import { useMeetingNavigation } from '@/features/meetings/navigation';
import { MeetingForm } from '@/features/meetings/components/MeetingForm';
import { CalendarStatusNotice } from '@/features/meetings/components/CalendarStatusNotice';
import type { MeetingFormValues } from '@/features/meetings/types';
import { showApiErrorToast } from '@/lib/api/errors';

export default function NewMeetingPage() {
  const nav = useMeetingNavigation();
  const { data: calendarStatus } = useCalendarStatus();
  const { mutateAsync: createMeeting, isPending } = useCreateMeeting();
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

  const handleSubmit = async (values: MeetingFormValues) => {
    setServerErrors(undefined);
    try {
      const { meeting } = await createMeeting({
        title: values.title,
        description: values.description,
        location: values.location,
        timezone: values.timezone,
        start_at: values.startDate.toISOString(),
        end_at: values.endDate.toISOString(),
        reminders: values.reminders.map((r) => ({
          offset_minutes: r.offsetMinutes,
          remind_at: r.customRemindAt,
        })),
        attendees: [
          ...values.internalAttendees.map((a) => ({
            user_id: a.id,
            email: a.email,
            display_name: a.name,
            is_optional: a.isOptional,
          })),
          ...values.externalAttendees.map((a) => ({
            email: a.email,
            display_name: a.displayName,
            is_optional: a.isOptional,
          })),
        ],
      });
      if (meeting) {
        nav.goToMeetingDetail(meeting.id);
      } else {
        nav.goToMeetingsList();
      }
    } catch (err: unknown) {
      if (
        typeof err === 'object' && err !== null &&
        'status' in err && (err as { status: number }).status === 422 &&
        'errors' in err
      ) {
        setServerErrors((err as { errors: Record<string, string[]> }).errors);
      } else {
        showApiErrorToast(err, 'Could not schedule meeting');
      }
    }
  };

  const calendarWarning = calendarStatus && (!calendarStatus.connected || calendarStatus.status !== 'active');

  return (
    <ScreenErrorBoundary screenName="NewMeeting">
      <div className="relative min-h-screen bg-[#0A1D25] text-white flex flex-col font-sans select-none overflow-hidden pb-10">
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-6 mb-6">
          <button
            onClick={nav.goBack}
            className="text-sm font-semibold text-[#75ADAF] hover:text-[#5DA1A3] transition-colors focus:outline-none"
          >
            ‹ Back
          </button>
          <h2 className="font-bold text-lg text-white">New Meeting</h2>
          <div className="w-12" />
        </div>

        {/* Form area */}
        <div className="relative z-10 flex-1 px-5 overflow-y-auto">
          {calendarWarning && calendarStatus && (
            <div className="mb-4">
              <CalendarStatusNotice calendarStatus={calendarStatus} />
            </div>
          )}
          <MeetingForm
            onSubmit={handleSubmit}
            isSubmitting={isPending}
            submitLabel="Create Meeting"
            serverErrors={serverErrors}
          />
        </div>
      </div>
    </ScreenErrorBoundary>
  );
}
