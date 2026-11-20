import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ImportFailedRowEditor } from "@/components/crm/import-failed-row-editor";
import type { CrmLabel, FailedImportRow } from "@/lib/api/crm";

const labels: CrmLabel[] = [
    { id: 1, company_id: 1, slug: "new_lead", name: "New Lead", color: "#000", sort_order: 0, is_default: true },
    { id: 2, company_id: 1, slug: "contacted", name: "Contacted", color: "#000", sort_order: 1, is_default: false },
];

const failed = (overrides: Partial<FailedImportRow> = {}): FailedImportRow => ({
    row_index: 4,
    data: { name: "Faith Dove", email: "faith@", status: "New Lead", priority: "medium", budget_currency: "USD" },
    errors: ["Email 'faith@' is not a valid email address."],
    field_errors: { email: "Email 'faith@' is not a valid email address." },
    ...overrides,
});

describe("ImportFailedRowEditor", () => {
    it("outlines the field at fault and explains it right beneath", () => {
        render(<ImportFailedRowEditor row={failed()} labels={labels} onChange={vi.fn()} />);

        const email = screen.getByLabelText("Email");
        expect(email.getAttribute("aria-invalid")).toBe("true");
        expect(screen.getByText("Email 'faith@' is not a valid email address.").id).toBe(email.getAttribute("aria-describedby"));
        expect(screen.getByText(/Fix 1 field: Email/)).not.toBeNull();
        expect(screen.getByLabelText(/^Name/).getAttribute("aria-invalid")).toBeNull();
    });

    it("offers stages, priorities and currencies as dropdowns", () => {
        const onChange = vi.fn();
        render(<ImportFailedRowEditor row={failed()} labels={labels} onChange={onChange} />);

        const status = screen.getByLabelText("Status (stage)") as HTMLSelectElement;
        expect(status.tagName).toBe("SELECT");
        expect(status.value).toBe("new_lead"); // "New Lead" was matched to its stage
        fireEvent.change(status, { target: { value: "contacted" } });
        expect(onChange).toHaveBeenCalledWith("status", "contacted");

        expect((screen.getByLabelText("Priority") as HTMLSelectElement).tagName).toBe("SELECT");
        expect((screen.getByLabelText("Currency") as HTMLSelectElement).value).toBe("USD");
    });

    it("says plainly when the failure was on our side", () => {
        render(
            <ImportFailedRowEditor
                row={failed({ field_errors: {}, server_error: true, data: { name: "Faith Dove" }, errors: ["We could not save this row because of a problem on our side, not with your data."] })}
                labels={labels}
                onChange={vi.fn()}
            />,
        );
        expect(screen.getByText(/not a problem with your data/)).not.toBeNull();
    });
});
