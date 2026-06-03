"use client";

import { createPortal } from "react-dom";
import { useMemo } from "react";
import { X } from "lucide-react";
import type { MeetingItem } from "@/lib/api/meetings";

type MeetingDetailsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    meeting: MeetingItem | null;
};

function formatDateTime(value?: string | null): string {
    if (!value) {
        return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function formatReminderLabel(reminder: { label?: string; offset_minutes?: number | null; remind_at: string }): string {
    if (reminder.label && reminder.label.trim() !== "") {
        return reminder.label;
    }

    if (typeof reminder.offset_minutes === "number") {
        if (reminder.offset_minutes < 60) {
            return `${reminder.offset_minutes} minutes before`;
        }

        if (reminder.offset_minutes < 1440) {
            return `${Math.floor(reminder.offset_minutes / 60)} hours before`;
        }

        return `${Math.floor(reminder.offset_minutes / 1440)} days before`;
    }

    return `Custom (${formatDateTime(reminder.remind_at)})`;
}

export function MeetingDetailsModal({ isOpen, onClose, meeting }: MeetingDetailsModalProps) {
    const internalAttendees = useMemo(() => {
        if (!meeting?.attendees) {
            return [];
        }

        return meeting.attendees.filter((attendee) => attendee.user_id != null);
    }, [meeting?.attendees]);

    const externalAttendees = useMemo(() => {
        if (!meeting?.attendees) {
            return [];
        }

        return meeting.attendees.filter((attendee) => attendee.user_id == null);
    }, [meeting?.attendees]);

    if (!isOpen || !meeting) {
        return null;
    }

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

            <div className="relative w-full max-w-2xl rounded-3xl border border-gray-100 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                    <h2 className="text-[16px] font-bold text-[#09232D]">Meeting Details</h2>
                    <button
                        onClick={onClose}
                        className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="max-h-[75dvh] space-y-4 overflow-y-auto px-6 py-4 text-[12px] text-[#0B1215]">
                    <div>
                        <p className="text-[18px] font-bold text-[#09232D]">{meeting.title}</p>
                        <p className="mt-1 text-[12px] text-gray-500">Status: {meeting.status}</p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Date & Time</p>
                            <p className="mt-1 font-medium">{formatDateTime(meeting.start_at)} - {formatDateTime(meeting.end_at)}</p>
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Organizer</p>
                            <p className="mt-1 font-medium">{meeting.creator?.name ?? "-"} ({meeting.creator?.email ?? "-"})</p>
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Meet Link</p>
                            {meeting.google_meet_url ? (
                                <a className="mt-1 block truncate font-medium text-[#094B5C] underline" href={meeting.google_meet_url} target="_blank" rel="noreferrer">
                                    {meeting.google_meet_url}
                                </a>
                            ) : (
                                <p className="mt-1 font-medium">Not available</p>
                            )}
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Created</p>
                            <p className="mt-1 font-medium">{formatDateTime(meeting.created_at ?? null)}</p>
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Description</p>
                        <p className="mt-1 whitespace-pre-wrap">{meeting.description?.trim() ? meeting.description : "No description provided."}</p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Internal Attendees</p>
                            {internalAttendees.length > 0 ? (
                                <ul className="mt-1 space-y-1">
                                    {internalAttendees.map((attendee) => (
                                        <li key={`${attendee.email}-${attendee.id ?? "internal"}`}>{attendee.display_name || attendee.email} ({attendee.email})</li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="mt-1">None</p>
                            )}
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">External Attendees</p>
                            {externalAttendees.length > 0 ? (
                                <ul className="mt-1 space-y-1">
                                    {externalAttendees.map((attendee) => (
                                        <li key={`${attendee.email}-${attendee.id ?? "external"}`}>{attendee.display_name || attendee.email} ({attendee.email})</li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="mt-1">None</p>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Reminder Schedule</p>
                        {meeting.reminder_config && meeting.reminder_config.length > 0 ? (
                            <ul className="mt-1 space-y-1">
                                {meeting.reminder_config.map((reminder, index) => (
                                    <li key={`${meeting.id}-reminder-${index}`}>{formatReminderLabel(reminder)}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="mt-1">No reminders configured.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
