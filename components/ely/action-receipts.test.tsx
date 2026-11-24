import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ElyActionReceipts, receiptHref, receiptsFromPayload } from "./action-receipts";

describe("receiptsFromPayload", () => {
    it("reads receipts from an agent payload and ignores anything else", () => {
        expect(receiptsFromPayload({ receipts: [{ tool: "crm.labels.create", summary: "Stage added." }, { bad: true }] })).toEqual([
            { tool: "crm.labels.create", summary: "Stage added." },
        ]);
        expect(receiptsFromPayload(null)).toEqual([]);
        expect(receiptsFromPayload({ confirmation_required: true })).toEqual([]);
    });
});

describe("receiptHref", () => {
    it("sends agents to the agent area", () => {
        expect(receiptHref("/crm/leads/4", true)).toBe("/agent/crm/leads/4");
        expect(receiptHref("/crm/leads/4", false)).toBe("/crm/leads/4");
        expect(receiptHref("/agent/tasks/2", true)).toBe("/agent/tasks/2");
        expect(receiptHref("/settings", true)).toBe("/settings");
    });
});

describe("ElyActionReceipts", () => {
    it("shows the summary, an Open link and undoes once", async () => {
        const onUndo = vi.fn().mockResolvedValue({ response: { payload: { undone: true } } });

        render(
            <ElyActionReceipts
                isAgent={false}
                onUndo={onUndo}
                receipts={[{ tool: "crm.labels.create", summary: "Stage 'Sample Sent' was added.", link: "/crm", audit_id: 7, undo_label: "Remove this stage" }]}
            />
        );

        expect(screen.getByText("Stage 'Sample Sent' was added.")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe("/crm");

        fireEvent.click(screen.getByRole("button", { name: "Remove this stage" }));

        await waitFor(() => expect(screen.getByText("Undone")).toBeTruthy());
        expect(onUndo).toHaveBeenCalledWith(7);
        expect(screen.queryByRole("button", { name: "Remove this stage" })).toBeNull();
    });

    it("has no Undo button when the action cannot be undone", () => {
        render(
            <ElyActionReceipts
                isAgent
                onUndo={vi.fn()}
                receipts={[{ tool: "crm.create_lead", summary: "Lead added.", link: "/crm/leads/3", audit_id: 9, undo_label: null }]}
            />
        );

        expect(screen.queryByRole("button")).toBeNull();
        expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe("/agent/crm/leads/3");
    });
});
