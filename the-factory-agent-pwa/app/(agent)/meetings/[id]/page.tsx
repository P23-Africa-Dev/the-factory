'use client';

import React, { use } from 'react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import { useMeeting, useCancelMeeting, useDeleteMeeting, useResyncMeeting } from '@/features/meetings/queries';
import { useMeetingNavigation } from '@/features/meetings/navigation';
import { MeetingStatusBadge } from '@/features/meetings/components/MeetingStatusBadge';
import { SyncStatusBanner } from '@/features/meetings/components/SyncStatusBanner';
import { toast } from '@/lib/toast';
import { showApiErrorToast } from '@/lib/api/errors';

interface MeetingDetailPageProps {
  params: Promise<{ id: string }>;
}

function formatDateTime(iso: string, timezone: string): string {
  try {
    return new Date(iso).toLocaleString('en-NG', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
    });
  } catch {
    return new Date(iso).toLocaleString('en-NG', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }
}

export default function MeetingDetailPage({ params }: MeetingDetailPageProps) {
  const { id } = use(params);
  const nav = useMeetingNavigation();

  const { data: meeting, isLoading } = useMeeting(id);
  const { mutate: cancelMeeting, isPending: isCancelling } = useCancelMeeting();
  const { mutate: deleteMeeting, isPending: isDeleting } = useDeleteMeeting();
  const { mutate: resyncMeeting, isPending: isSyncing } = useResyncMeeting();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen bg-[#0A1D25] text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-[#0A1D25] text-white gap-4 p-5 text-center">
        <p className="text-sm text-white/50">Meeting not found</p>
        <button
          onClick={nav.goBack}
          className="px-6 py-2.5 bg-white/[0.08] text-[#75ADAF] text-xs font-semibold rounded-full hover:bg-white/[0.12] transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  const isActive = meeting.status === 'scheduled';
  const canEdit = isActive;
  const canCancel = isActive;
  const canDelete = meeting.status === 'cancelled';
  const canResync = meeting.syncStatus === 'failed';

  const handleCancel = () => {
    if (window.confirm('Are you sure you want to cancel this meeting?')) {
      cancelMeeting(id, {
        onSuccess: () => {
          toast.success('Meeting cancelled successfully');
        },
        onError: (err) => showApiErrorToast(err, 'Could not cancel meeting'),
      });
    }
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to permanently delete this meeting?')) {
      deleteMeeting(id, {
        onSuccess: () => {
          toast.success('Meeting deleted successfully');
          nav.goBack();
        },
        onError: (err) => showApiErrorToast(err, 'Could not delete meeting'),
      });
    }
  };

  return (
    <ScreenErrorBoundary screenName="MeetingDetail">
      <div className="relative min-h-screen bg-[#0A1D25] text-white flex flex-col font-sans select-none overflow-hidden pb-10">
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top,0px)+24px)] mb-6">
          <button
            onClick={nav.goBack}
            className="text-sm font-semibold text-[#75ADAF] hover:text-[#5DA1A3] transition-colors focus:outline-none"
          >
            ‹ Back
          </button>
          <h2 className="font-bold text-lg text-white">Meeting Details</h2>
          {canEdit ? (
            <button
              onClick={() => nav.goToEditMeeting(meeting.id)}
              className="text-sm font-semibold text-[#75ADAF] hover:text-[#5DA1A3] transition-colors focus:outline-none"
            >
              Edit
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>

        {/* Scroll Content */}
        <div className="relative z-10 flex-1 px-5 overflow-y-auto flex flex-col gap-4 pb-20">
          {/* Sync banner */}
          <SyncStatusBanner
            syncStatus={meeting.syncStatus}
            syncErrorMessage={meeting.syncErrorMessage}
            googleMeetUrl={meeting.googleMeetUrl}
            onRetry={canResync ? () => resyncMeeting(meeting.id) : undefined}
            isRetrying={isSyncing}
          />

          {/* Title Card */}
          <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-bold text-lg text-white leading-snug">{meeting.title}</h3>
              <div className="flex-shrink-0">
                <MeetingStatusBadge status={meeting.status} />
              </div>
            </div>
            {meeting.description && (
              <p className="text-xs text-white/60 leading-relaxed break-words whitespace-pre-wrap pt-1 border-t border-white/5">
                {meeting.description}
              </p>
            )}
          </div>

          {/* Date & Time Card */}
          <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg flex flex-col gap-2">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Date & Time</span>
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-semibold text-white">
                {formatDateTime(meeting.startAt, meeting.timezone)}
              </p>
              <p className="text-xs text-white/50">
                to {formatDateTime(meeting.endAt, meeting.timezone)}
              </p>
            </div>
            <span className="text-[10px] text-white/40 font-medium">{meeting.timezone}</span>
          </div>

          {/* Location Card */}
          {meeting.location && (
            <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Location</span>
              <p className="text-sm font-semibold text-white break-words">{meeting.location}</p>
            </div>
          )}

          {/* Google Meet Card */}
          {meeting.googleMeetUrl && (
            <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg flex flex-col gap-2">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Google Meet</span>
              <a
                href={meeting.googleMeetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-[#44AFCD] hover:text-[#59C2E0] underline break-all"
              >
                {meeting.googleMeetUrl}
              </a>
            </div>
          )}

          {/* Attendees Card */}
          {meeting.attendees.length > 0 && (
            <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg flex flex-col gap-3">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">
                Attendees ({meeting.attendees.length})
              </span>
              <div className="flex flex-col gap-3">
                {meeting.attendees.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 py-1">
                    <div className="w-8 h-8 rounded-full bg-[#75ADAF] flex items-center justify-center font-bold text-white text-xs">
                      {(a.displayName ?? a.email)[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{a.displayName ?? a.email}</p>
                      {a.displayName && <p className="text-[10px] text-white/50 truncate">{a.email}</p>}
                    </div>
                    {a.responseStatus && (
                      <span className="text-[10px] text-white/40 font-medium capitalize bg-white/[0.04] px-2 py-0.5 rounded border border-white/5">
                        {a.responseStatus.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Organizer Card */}
          {meeting.organizerName && (
            <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg flex flex-col gap-2">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Organized by</span>
              <p className="text-xs font-bold text-white">{meeting.organizerName}</p>
              {meeting.organizerEmail && <span className="text-[10px] text-white/40">{meeting.organizerEmail}</span>}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3 mt-4">
            {canCancel && (
              <button
                onClick={handleCancel}
                disabled={isCancelling}
                className="w-full h-12 flex items-center justify-center border border-red-500/30 hover:border-red-500/50 bg-red-500/10 hover:bg-red-500/15 text-red-400 text-sm font-semibold rounded-xl active:scale-95 disabled:opacity-50 transition-all"
              >
                {isCancelling ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                ) : (
                  'Cancel Meeting'
                )}
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="w-full h-12 flex items-center justify-center border border-red-800/30 hover:border-red-700/50 bg-red-900/20 hover:bg-red-900/30 text-white text-sm font-semibold rounded-xl active:scale-95 disabled:opacity-50 transition-all"
              >
                {isDeleting ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  'Delete Record'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </ScreenErrorBoundary>
  );
}
