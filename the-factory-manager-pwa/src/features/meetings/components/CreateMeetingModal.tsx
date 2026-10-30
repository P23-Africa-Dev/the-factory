'use client';

import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MeetingForm } from './MeetingForm';
import { CalendarStatusNotice } from './CalendarStatusNotice';
import { useCreateMeeting, useCalendarStatus } from '../queries';
import type { MeetingFormValues } from '../types';
import { toast } from '@/lib/toast';

function defaultStartFromDate(date?: Date): Date {
  const start = date ? new Date(date) : new Date();
  start.setHours(9, 0, 0, 0);
  if (!date) {
    start.setDate(start.getDate() + 1);
  }
  return start;
}

function buildInitialValues(defaultDate?: Date): Partial<MeetingFormValues> {
  const start = defaultStartFromDate(defaultDate);
  const end = new Date(start);
  end.setHours(start.getHours() + 1);
  return { startDate: start, endDate: end };
}

import type { CreateMeetingPayload } from '../types';

async function submitMeetingValues(
  values: MeetingFormValues,
  createMeeting: (payload: Omit<CreateMeetingPayload, 'company_id' | 'source_page'>) => Promise<{
    meeting: { id: number } | null;
    warnings: string[];
    queued: boolean;
  }>,
): Promise<{ meetingId: number | null }> {
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
  return { meetingId: meeting?.id ?? null };
}

interface CreateMeetingModalProps {
  open: boolean;
  onClose: () => void;
  defaultDate?: Date;
  onCreated?: (meetingId: number | null) => void;
}

export function CreateMeetingModal({
  open,
  onClose,
  defaultDate,
  onCreated,
}: CreateMeetingModalProps): React.ReactElement {
  const { data: calendarStatus } = useCalendarStatus();
  const { mutateAsync: createMeeting, isPending } = useCreateMeeting();
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | undefined>();

  const formKey = useMemo(
    () => (open ? `meeting-${defaultDate?.toISOString() ?? 'new'}` : 'closed'),
    [open, defaultDate],
  );

  const initialValues = useMemo(() => buildInitialValues(defaultDate), [defaultDate, formKey]);

  const calendarBlocked =
    calendarStatus && (!calendarStatus.connected || calendarStatus.status !== 'active');

  const handleSubmit = async (values: MeetingFormValues) => {
    setServerErrors(undefined);
    try {
      const { meetingId } = await submitMeetingValues(values, createMeeting);
      toast.success('Meeting scheduled');
      onCreated?.(meetingId);
      onClose();
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        (err as { status: number }).status === 422 &&
        'errors' in err
      ) {
        setServerErrors((err as { errors: Record<string, string[]> }).errors);
      } else {
        const message =
          err instanceof Error ? err.message : 'Could not create meeting. Please try again.';
        toast.error(message);
      }
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/50 font-sans">
          <div className="absolute inset-0 z-0" onClick={!isPending ? onClose : undefined} />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative z-10 w-full max-w-md max-h-[92vh] bg-[#0A1D25] rounded-t-[28px] border-t border-white/10 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="text-sm font-semibold text-[#75ADAF] disabled:opacity-50"
              >
                Cancel
              </button>
              <h3 className="font-bold text-base text-white">New Meeting</h3>
              <div className="w-14" />
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 pb-8">
              {calendarBlocked ? (
                calendarStatus && <CalendarStatusNotice calendarStatus={calendarStatus} />
              ) : (
                <MeetingForm
                  key={formKey}
                  initialValues={initialValues}
                  onSubmit={handleSubmit}
                  isSubmitting={isPending}
                  submitLabel="Create Meeting"
                  serverErrors={serverErrors}
                />
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export { submitMeetingValues, buildInitialValues };
