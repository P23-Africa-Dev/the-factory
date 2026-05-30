"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useCreateMeeting } from "@/hooks/use-meetings";
import {
    useCalendarIntegrationStatus,
    useCreateCalendarConnectUrl,
} from "@/hooks/use-calendar-integration";
import { useMeetingAttendeeCandidates } from "@/hooks/use-meeting-attendees";
import type { MeetingAttendeeCandidate } from "@/lib/api/meeting-attendees";
import type { MeetingItem } from "@/lib/api/meetings";

type ScheduleMeetingModalProps = {
    isOpen: boolean;
    onClose: () => void;
    defaultDate?: Date;
    title?: string;
    sourcePage?: "dashboard" | "operations" | "project" | "task" | "api";
    projectId?: number | string;
    taskId?: number | string;
    onCreated?: (meeting: MeetingItem) => void;
};

function toInputDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function defaultStart(date?: Date): string {
    const base = date ? new Date(date) : new Date();
    base.setHours(9, 0, 0, 0);
    if (!date) base.setDate(base.getDate() + 1);
    return toInputDateTime(base);
}

function defaultEnd(start: string): string {
    const startDate = new Date(start);
    if (Number.isNaN(startDate.getTime())) {
        const fallback = new Date();
        fallback.setDate(fallback.getDate() + 1);
        fallback.setHours(10, 0, 0, 0);
        return toInputDateTime(fallback);
    }

    startDate.setHours(startDate.getHours() + 1);
    return toInputDateTime(startDate);
}

function toInputDate(value: string): string {
    return value.slice(0, 10);
}

function toInputTime(value: string): string {
    return value.slice(11, 16);
}

function combineDateAndTime(dateValue: string, timeValue: string): Date | null {
    if (!dateValue || !timeValue) {
        return null;
    }

    const combined = new Date(`${dateValue}T${timeValue}:00`);

    return Number.isNaN(combined.getTime()) ? null : combined;
}

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function ScheduleMeetingModal({
    isOpen,
    onClose,
    defaultDate,
    title = "Schedule Meeting",
    sourcePage = "operations",
    projectId,
    taskId,
    onCreated,
}: ScheduleMeetingModalProps) {
    const user = useAuthStore((state) => state.user);
    const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
    const createMeetingMutation = useCreateMeeting();
    const integrationStatusQuery = useCalendarIntegrationStatus(companyId ?? undefined);
    const connectUrlMutation = useCreateCalendarConnectUrl();
    const attendeeCandidatesQuery = useMeetingAttendeeCandidates(companyId ?? undefined);

    const initialStart = useMemo(() => defaultStart(defaultDate), [defaultDate]);
    const initialEnd = useMemo(() => defaultEnd(initialStart), [initialStart]);
    const [meetingTitle, setMeetingTitle] = useState("");
    const [meetingDescription, setMeetingDescription] = useState("");
    const [meetingDate, setMeetingDate] = useState(toInputDate(initialStart));
    const [startTime, setStartTime] = useState(toInputTime(initialStart));
    const [endTime, setEndTime] = useState(toInputTime(initialEnd));
    const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos");
    const [externalEmailInput, setExternalEmailInput] = useState("");
    const [externalAttendees, setExternalAttendees] = useState<Array<{ email: string; display_name?: string }>>([]);
    const [selectedInternalAttendeeIds, setSelectedInternalAttendeeIds] = useState<number[]>([]);
    const [internalSearch, setInternalSearch] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});

    const isSubmitting = createMeetingMutation.isPending;
    const canConnectIntegration = role === "owner";
    const integration = integrationStatusQuery.data;
    const attendeeCandidates = attendeeCandidatesQuery.data ?? [];

    const selectedInternalAttendees = useMemo(
        () => attendeeCandidates.filter((candidate) => selectedInternalAttendeeIds.includes(candidate.id)),
        [attendeeCandidates, selectedInternalAttendeeIds]
    );

    const effectiveSourcePage = sourcePage === "operations"
        ? (taskId != null ? "task" : projectId != null ? "project" : "operations")
        : sourcePage;

    const filteredAttendeeCandidates = useMemo(() => {
        const search = internalSearch.trim().toLowerCase();

        if (search === "") {
            return attendeeCandidates;
        }

        return attendeeCandidates.filter((candidate) => {
            return [candidate.name, candidate.email, candidate.display_role, candidate.company_role]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(search));
        });
    }, [attendeeCandidates, internalSearch]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const nextStart = defaultStart(defaultDate);

        setMeetingTitle("");
        setMeetingDescription("");
        setMeetingDate(toInputDate(nextStart));
        setStartTime(toInputTime(nextStart));
        setEndTime(toInputTime(defaultEnd(nextStart)));
        setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos");
        setExternalEmailInput("");
        setExternalAttendees([]);
        setSelectedInternalAttendeeIds([]);
        setInternalSearch("");
        setErrors({});
    }, [defaultDate, isOpen]);

    const toggleInternalAttendee = (candidate: MeetingAttendeeCandidate) => {
        setSelectedInternalAttendeeIds((current) => {
            if (current.includes(candidate.id)) {
                return current.filter((id) => id !== candidate.id);
            }

            return [...current, candidate.id];
        });
    };

    const addExternalEmails = (value: string): void => {
        const emails = value
            .split(/[\n,;]+/)
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
            .filter((email) => isValidEmail(email))
            .map((email) => email.toLowerCase());

        if (emails.length === 0) {
            return;
        }

        setExternalAttendees((current) => {
            const existing = new Set(current.map((item) => item.email.toLowerCase()));
            const next = [...current];

            emails.forEach((email) => {
                if (!existing.has(email)) {
                    existing.add(email);
                    next.push({ email });
                }
            });

            return next;
        });
    };

    const handleExternalEmailCommit = (value?: string) => {
        const raw = (value ?? externalEmailInput).trim();

        if (raw === "") {
            return;
        }

        if (!isValidEmail(raw)) {
            toast.error("Enter a valid email address.");
            return;
        }

        addExternalEmails(raw);
        setExternalEmailInput("");
    };

    const handleConnectGoogleCalendar = () => {
        if (!companyId) {
            toast.error("Company context is required.");
            return;
        }

        connectUrlMutation.mutate(
            { company_id: companyId },
            {
                onSuccess: (response) => {
                    const authorizationUrl = response.data.authorization_url;
                    if (!authorizationUrl) {
                        toast.error("Unable to open Google authorization URL.");
                        return;
                    }

                    const popup = window.open(authorizationUrl, "google-calendar-connect", "width=560,height=720");
                    if (!popup) {
                        window.location.href = authorizationUrl;
                        return;
                    }

                    toast.info("Complete Google sign-in, then refresh this dialog to verify connection.");
                },
                onError: (error: unknown) => {
                    const apiError = error as { message?: string };
                    toast.error(apiError.message || "Failed to start Google Calendar connection.");
                },
            }
        );
    };

    const validate = (): boolean => {
        const nextErrors: Record<string, string> = {};

        if (!meetingTitle.trim()) {
            nextErrors.title = "Meeting title is required.";
        }

        if (!meetingDescription.trim()) {
            nextErrors.description = "Meeting description is required.";
        }

        if (!meetingDate.trim()) {
            nextErrors.date = "Meeting date is required.";
        }

        if (!timezone.trim()) {
            nextErrors.timezone = "Timezone is required.";
        }

        const startDate = combineDateAndTime(meetingDate, startTime);
        const endDate = combineDateAndTime(meetingDate, endTime);

        if (!startDate) {
            nextErrors.start_at = "Valid start date/time is required.";
        }

        if (!endDate) {
            nextErrors.end_at = "Valid end date/time is required.";
        }

        if (startDate && endDate && endDate <= startDate) {
            nextErrors.end_at = "End time must be after start time.";
        }

        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleSubmit = () => {
        if (!validate()) {
            return;
        }

        if (!companyId) {
            toast.error("Company context is required.");
            return;
        }

        const startDate = combineDateAndTime(meetingDate, startTime);
        const endDate = combineDateAndTime(meetingDate, endTime);

        if (!startDate || !endDate) {
            toast.error("Please provide a valid meeting date and time.");
            return;
        }

        const attendees = [
            ...externalAttendees.map((attendee) => ({ email: attendee.email, display_name: attendee.display_name })),
            ...selectedInternalAttendees.map((candidate) => ({
                email: candidate.email,
                display_name: candidate.name,
                user_id: candidate.id,
            })),
        ].reduce<Array<{ email: string; display_name?: string; user_id?: number }>>((accumulator, attendee) => {
            const normalizedEmail = attendee.email.toLowerCase();
            const existingIndex = accumulator.findIndex((item) => item.email.toLowerCase() === normalizedEmail);

            if (existingIndex >= 0) {
                accumulator[existingIndex] = attendee;
                return accumulator;
            }

            accumulator.push(attendee);
            return accumulator;
        }, []);

        createMeetingMutation.mutate(
            {
                company_id: companyId,
                project_id: projectId ?? undefined,
                task_id: taskId ?? undefined,
                title: meetingTitle.trim(),
                description: meetingDescription.trim(),
                timezone: timezone.trim(),
                start_at: startDate.toISOString(),
                end_at: endDate.toISOString(),
                source_page: effectiveSourcePage,
                attendees,
            },
            {
                onSuccess: (response) => {
                    const warning = response.data.warnings?.[0];
                    if (warning) {
                        toast.warning(warning);
                    } else {
                        toast.success("Meeting scheduled successfully.");
                    }
                    onCreated?.(response.data.meeting);
                    onClose();
                },
                onError: (error: unknown) => {
                    const apiError = error as { message?: string; errors?: Record<string, string[]> };
                    const mapped: Record<string, string> = {};
                    if (apiError.errors?.title?.[0]) mapped.title = apiError.errors.title[0];
                    if (apiError.errors?.start_at?.[0]) mapped.start_at = apiError.errors.start_at[0];
                    if (apiError.errors?.end_at?.[0]) mapped.end_at = apiError.errors.end_at[0];
                    if (Object.keys(mapped).length > 0) setErrors((prev) => ({ ...prev, ...mapped }));
                    toast.error(apiError.message || "Failed to schedule meeting.");
                },
            }
        );
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/25" onClick={onClose} />

            <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white shadow-2xl">
                    <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                        <h2 className="text-[16px] font-bold text-[#09232D]">{title}</h2>
                        <button
                            onClick={onClose}
                            className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="space-y-3 px-5 py-4">
                        {integration && !integration.connected && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                                <p className="text-[11px] font-semibold text-amber-800">
                                    {canConnectIntegration
                                        ? "Google Calendar is not connected for this company."
                                        : "Owner must connect Google Calendar for automatic sync."}
                                </p>
                                {integration.last_error_message && (
                                    <p className="mt-1 text-[10px] text-amber-700">{integration.last_error_message}</p>
                                )}
                                {canConnectIntegration && (
                                    <button
                                        onClick={handleConnectGoogleCalendar}
                                        disabled={connectUrlMutation.isPending}
                                        className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                                    >
                                        {connectUrlMutation.isPending ? "Preparing..." : "Connect Google Calendar"}
                                    </button>
                                )}
                            </div>
                        )}

                        {integration && integration.connected && (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                                <p className="text-[11px] font-semibold text-emerald-800">
                                    Connected as {integration.organizer_email ?? "company organizer"}
                                </p>
                            </div>
                        )}

                        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#0B1215]">
                                        Internal attendees
                                    </p>
                                    <p className="text-[10px] text-gray-500">
                                        Select any company member: owner, admin, supervisor, or agent.
                                    </p>
                                </div>
                                {selectedInternalAttendees.length > 0 && (
                                    <span className="rounded-full bg-[#09232D] px-2 py-1 text-[10px] font-semibold text-white">
                                        {selectedInternalAttendees.length} selected
                                    </span>
                                )}
                            </div>

                            <div className="relative mb-2">
                                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                <input
                                    value={internalSearch}
                                    onChange={(event) => setInternalSearch(event.target.value)}
                                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-[12px] outline-none transition-colors focus:border-[#094B5C]"
                                    placeholder="Search company members"
                                />
                            </div>

                            <div className="max-h-52 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                                {attendeeCandidatesQuery.isPending ? (
                                    <div className="rounded-xl bg-white px-3 py-3 text-[11px] text-gray-500">
                                        Loading company members...
                                    </div>
                                ) : filteredAttendeeCandidates.length === 0 ? (
                                    <div className="rounded-xl bg-white px-3 py-3 text-[11px] text-gray-500">
                                        No company members match your search.
                                    </div>
                                ) : (
                                    filteredAttendeeCandidates.map((candidate) => {
                                        const isSelected = selectedInternalAttendeeIds.includes(candidate.id);

                                        return (
                                            <button
                                                key={candidate.id}
                                                type="button"
                                                onClick={() => toggleInternalAttendee(candidate)}
                                                className={[
                                                    "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all",
                                                    isSelected
                                                        ? "border-[#094B5C] bg-white shadow-sm"
                                                        : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50",
                                                ].join(" ")}
                                            >
                                                <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#EAF2F3] text-[11px] font-bold text-[#094B5C]">
                                                    {candidate.avatar_url ? (
                                                        <img
                                                            src={candidate.avatar_url}
                                                            alt={candidate.name}
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        <span>{candidate.name.slice(0, 2).toUpperCase()}</span>
                                                    )}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <p className="truncate text-[12px] font-semibold text-[#0B1215]">
                                                            {candidate.name}
                                                        </p>
                                                        <span className="rounded-full bg-[#EEF4F4] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#094B5C]">
                                                            {candidate.display_role}
                                                        </span>
                                                    </div>
                                                    <p className="truncate text-[10px] text-gray-500">{candidate.email}</p>
                                                </div>

                                                <div className={[
                                                    "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold",
                                                    isSelected
                                                        ? "border-[#094B5C] bg-[#094B5C] text-white"
                                                        : "border-gray-300 bg-white text-transparent",
                                                ].join(" ")}>
                                                    ✓
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>

                            {selectedInternalAttendees.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {selectedInternalAttendees.map((candidate) => (
                                        <button
                                            key={candidate.id}
                                            type="button"
                                            onClick={() => toggleInternalAttendee(candidate)}
                                            className="inline-flex items-center gap-2 rounded-full bg-[#094B5C] px-3 py-1 text-[10px] font-semibold text-white"
                                        >
                                            {candidate.name}
                                            <span className="text-white/75">×</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <label className="block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]">Meeting Title</label>
                        <input
                            value={meetingTitle}
                            onChange={(event) => {
                                setMeetingTitle(event.target.value);
                                setErrors((prev) => ({ ...prev, title: "" }));
                            }}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 px-3 text-sm outline-none transition-colors focus:border-[#094B5C]"
                            placeholder="What is this meeting about?"
                        />
                        {errors.title && <p className="text-[11px] text-red-500">{errors.title}</p>}

                        <label className="block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]">Meeting Description</label>
                        <textarea
                            value={meetingDescription}
                            onChange={(event) => {
                                setMeetingDescription(event.target.value);
                                setErrors((prev) => ({ ...prev, description: "" }));
                            }}
                            className="min-h-[84px] w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 px-3 text-sm outline-none transition-colors focus:border-[#094B5C]"
                            placeholder="What is this meeting about?"
                        />
                        {errors.description && <p className="text-[11px] text-red-500">{errors.description}</p>}

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]">Meeting Date</label>
                                <input
                                    type="date"
                                    value={meetingDate}
                                    onChange={(event) => {
                                        setMeetingDate(event.target.value);
                                        setErrors((prev) => ({ ...prev, date: "" }));
                                    }}
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 px-3 text-sm outline-none transition-colors focus:border-[#094B5C]"
                                />
                                {errors.date && <p className="text-[11px] text-red-500">{errors.date}</p>}
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]">Timezone</label>
                                <input
                                    value={timezone}
                                    onChange={(event) => {
                                        setTimezone(event.target.value);
                                        setErrors((prev) => ({ ...prev, timezone: "" }));
                                    }}
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 px-3 text-sm outline-none transition-colors focus:border-[#094B5C]"
                                    placeholder="Africa/Lagos"
                                />
                                {errors.timezone && <p className="text-[11px] text-red-500">{errors.timezone}</p>}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]">Start Time</label>
                                <input
                                    type="time"
                                    value={startTime}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        setStartTime(value);
                                        setEndTime((current) => current || value);
                                        setErrors((prev) => ({ ...prev, start_at: "" }));
                                    }}
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 px-3 text-sm outline-none transition-colors focus:border-[#094B5C]"
                                />
                                {errors.start_at && <p className="text-[11px] text-red-500">{errors.start_at}</p>}
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]">End Time</label>
                                <input
                                    type="time"
                                    value={endTime}
                                    onChange={(event) => {
                                        setEndTime(event.target.value);
                                        setErrors((prev) => ({ ...prev, end_at: "" }));
                                    }}
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 px-3 text-sm outline-none transition-colors focus:border-[#094B5C]"
                                />
                                {errors.end_at && <p className="text-[11px] text-red-500">{errors.end_at}</p>}
                            </div>
                        </div>

                        <label className="block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]">External Attendees</label>
                        <div className="relative">
                            <Users className="pointer-events-none absolute left-3 top-3 text-gray-400" size={14} />
                            <div className="min-h-[84px] w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 pl-9 text-sm focus-within:border-[#094B5C]">
                                <div className="flex flex-wrap gap-2">
                                    {externalAttendees.map((attendee) => (
                                        <button
                                            key={attendee.email}
                                            type="button"
                                            onClick={() => {
                                                setExternalAttendees((current) => current.filter((item) => item.email !== attendee.email));
                                            }}
                                            className="inline-flex items-center gap-2 rounded-full bg-[#094B5C] px-3 py-1 text-[10px] font-semibold text-white"
                                        >
                                            {attendee.email}
                                            <span className="text-white/75">×</span>
                                        </button>
                                    ))}
                                    <input
                                        value={externalEmailInput}
                                        onChange={(event) => setExternalEmailInput(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === "Tab") {
                                                const hasValue = externalEmailInput.trim() !== "";
                                                if (hasValue) {
                                                    event.preventDefault();
                                                    handleExternalEmailCommit();
                                                }
                                            }
                                        }}
                                        onBlur={() => handleExternalEmailCommit()}
                                        className="min-w-[180px] flex-1 bg-transparent outline-none"
                                        placeholder={externalAttendees.length === 0 ? "example@email.com" : "Add another email"}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
                        <button
                            onClick={onClose}
                            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="rounded-xl bg-[#09232D] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 inline-flex items-center gap-2"
                        >
                            {isSubmitting && <Loader2 className="animate-spin" size={14} />}
                            {isSubmitting ? "Saving..." : "Save Meeting"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
