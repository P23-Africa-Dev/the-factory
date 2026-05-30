export function canConnectGoogleCalendar(role?: string | null): boolean {
    return role === "owner" || role === "admin";
}

export function canAccessMeetingCreation(role: string | null | undefined, calendarConnected: boolean): boolean {
    return canConnectGoogleCalendar(role) || calendarConnected;
}

export function getMeetingCreationTooltip(role: string | null | undefined, calendarConnected: boolean): string | undefined {
    if (canConnectGoogleCalendar(role) || calendarConnected) {
        return undefined;
    }

    return "Google Calendar must be connected by an Account Administrator before meetings can be created.";
}

export function getMeetingAccessNotice(role: string | null | undefined, calendarConnected: boolean): string | null {
    if (calendarConnected) {
        return null;
    }

    if (canConnectGoogleCalendar(role)) {
        return "Google Calendar is not connected yet. Open the meeting modal to connect it before creating meetings.";
    }

    return "Meeting creation is currently unavailable because your organization's Google Calendar account has not been connected yet. Please contact your organization's Owner or Administrator to complete the calendar setup.";
}