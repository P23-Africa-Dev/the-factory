import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentConfirmationCard, agentConfirmationFromPayload, usesAgentCard } from "./agent-confirmation-card";

const payload = {
    confirmation_required: true as const,
    engine: "agent" as const,
    tool: "org.users.suspend",
    pending_action_id: "01PENDING",
    action_label: "Suspend a team member for a number of days, until a date, or permanently.",
    action_args: { user_id: 12, suspend_type: "duration", suspend_days: 3 },
    preview_fields: ["user_id", "suspend_type", "suspend_days"],
    editable_fields: ["suspend_type", "suspend_days"],
    field_labels: { user_id: "User", suspend_type: "Suspend type", suspend_days: "Suspend days" },
    field_options: { suspend_type: ["duration", "date", "permanent"] },
    missing_fields: [],
};

describe("agent confirmation helpers", () => {
    it("uses the agent card only for agent actions without a dedicated editor", () => {
        expect(usesAgentCard(payload)).toBe(true);
        expect(usesAgentCard({ ...payload, tool: "tasks.create" })).toBe(false);
        expect(usesAgentCard({ confirmation_required: true, tool: "org.users.suspend" })).toBe(false);
        expect(agentConfirmationFromPayload(null)).toBeNull();
    });
});

describe("AgentConfirmationCard", () => {
    it("shows the details and confirms with edits", async () => {
        const onConfirm = vi.fn().mockResolvedValue({ response: { content: "Done." } });
        render(<AgentConfirmationCard payload={payload} onConfirm={onConfirm} onCancel={vi.fn()} />);

        expect(screen.getByText(payload.action_label)).toBeTruthy();
        expect(screen.getByText("Suspend days")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
        fireEvent.change(screen.getByLabelText("Suspend days"), { target: { value: "5" } });
        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

        await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("01PENDING", { suspend_days: 5 }));
        await waitFor(() => expect(screen.getByText("Handled.")).toBeTruthy());
    });

    it("cancels", async () => {
        const onCancel = vi.fn().mockResolvedValue({ response: { content: "Cancelled." } });
        render(<AgentConfirmationCard payload={payload} onConfirm={vi.fn()} onCancel={onCancel} />);

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

        await waitFor(() => expect(onCancel).toHaveBeenCalledWith("01PENDING"));
    });
});
