'use client';

import React, { useState, use } from 'react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import { useMeeting, useUpdateMeeting } from '@/features/meetings/queries';
import { useMeetingNavigation } from '@/features/meetings/navigation';
import { MeetingForm } from '@/features/meetings/components/MeetingForm';
import type { MeetingFormValues } from '@/features/meetings/types';
import { showApiErrorToast } from '@/lib/api/errors';

interface EditMeetingPageProps {
  params: Promise<{ id: string }>;
}

export default function EditMeetingPage({ params }: EditMeetingPageProps) {
  const { id } = use(params);
  const nav = useMeetingNavigation();

  const { data: meeting, isLoading } = useMeeting(id);
  const { mutateAsync: updateMeeting, isPending } = useUpdateMeeting();
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen bg-[#0A1D25] text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
      </div>
    );
  }

  if (!meeting || meeting.status !== 'scheduled') {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-[#0A1D25] text-white gap-4 p-5 text-center">
        <p className="text-sm text-white/50">Meeting cannot be edited</p>
        <button
          onClick={nav.goBack}
          className="px-6 py-2.5 bg-white/[0.08] text-[#75ADAF] text-xs font-semibold rounded-full hover:bg-white/[0.12] transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  const initialValues: MeetingFormValues = {
    title: meeting.title,
    description: meeting.description ?? '',
    location: meeting.location ?? '',
    timezone: meeting.timezone,
    startDate: new Date(meeting.startAt),
    endDate: new Date(meeting.endAt),
    reminders: meeting.reminderConfig.map((r) => ({
      offsetMinutes: r.offsetMinutes ?? undefined,
      customRemindAt: r.customRemindAt ?? undefined,
    })),
    internalAttendees: meeting.attendees
      .filter((a) => a.userId != null)
      .map((a) => ({
        id: a.userId!,
        name: a.displayName ?? a.email,
        email: a.email,
        isOptional: a.isOptional,
      })),
    externalAttendees: meeting.attendees
      .filter((a) => a.userId == null)
      .map((a) => ({
        email: a.email,
        displayName: a.displayName ?? '',
        isOptional: a.isOptional,
      })),
  };

  const handleSubmit = async (values: MeetingFormValues) => {
    setServerErrors(undefined);
    try {
      await updateMeeting({
        id: id,
        payload: {
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
        },
      });
      nav.goBack();
    } catch (err: unknown) {
      if (
        typeof err === 'object' && err !== null &&
        'status' in err && (err as { status: number }).status === 422 &&
        'errors' in err
      ) {
        setServerErrors((err as { errors: Record<string, string[]> }).errors);
      } else {
        showApiErrorToast(err, 'Could not update meeting');
      }
    }
  };

  return (
    <ScreenErrorBoundary screenName="EditMeeting">
      <div className="relative min-h-screen bg-[#0A1D25] text-white flex flex-col font-sans select-none overflow-hidden pb-10">
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top,0px)+24px)] mb-6">
          <button
            onClick={nav.goBack}
            className="text-sm font-semibold text-[#75ADAF] hover:text-[#5DA1A3] transition-colors focus:outline-none"
          >
            ‹ Back
          </button>
          <h2 className="font-bold text-lg text-white">Edit Meeting</h2>
          <div className="w-12" />
        </div>

        {/* Form area */}
        <div className="relative z-10 flex-1 px-5 overflow-y-auto">
          <MeetingForm
            initialValues={initialValues}
            onSubmit={handleSubmit}
            isSubmitting={isPending}
            submitLabel="Save Changes"
            serverErrors={serverErrors}
            autoAddCreator={false}
          />
        </div>
      </div>
    </ScreenErrorBoundary>
  );
}
