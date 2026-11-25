import { describe, expect, it } from "vitest";

import { formatThreadRelativeTime, threadDisplayTitle } from "./threads";

describe("chat list helpers", () => {
    it("prefers title, then preview, then a default", () => {
        expect(threadDisplayTitle({ title: "Overdue tasks", last_message_preview: "x" })).toBe("Overdue tasks");
        expect(threadDisplayTitle({ title: null, last_message_preview: "Show my leads" })).toBe("Show my leads");
        expect(threadDisplayTitle({ last_message_preview: null })).toBe("ELY chat");
        expect(threadDisplayTitle({ title: "  ", last_message_preview: "" })).toBe("ELY chat");
    });

    it("formats relative times", () => {
        const now = Date.parse("2026-11-24T12:00:00.000Z");
        expect(formatThreadRelativeTime("2026-11-24T11:59:30.000Z", now)).toBe("just now");
        expect(formatThreadRelativeTime("2026-11-24T11:55:00.000Z", now)).toBe("5m ago");
        expect(formatThreadRelativeTime("2026-11-24T10:00:00.000Z", now)).toBe("2h ago");
        expect(formatThreadRelativeTime("2026-11-21T12:00:00.000Z", now)).toBe("3d ago");
        expect(formatThreadRelativeTime("bad", now)).toBe("");
    });
});
