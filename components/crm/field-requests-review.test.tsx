import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FieldRequestsBanner } from "./field-requests-review";
import type { LeadFieldDefinition } from "@/lib/api/crm";

const mutateAsync = vi.fn();

vi.mock("@/hooks/use-crm", () => ({
  useReviewLeadField: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("@/components/ui/modal-portal", () => ({
  ModalPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function request(id: number, label: string, agent = "Siro", usage: number | null = null): LeadFieldDefinition {
  return {
    id,
    company_id: 1,
    key: `field_${id}`,
    label,
    type: "text",
    options: [],
    is_required: false,
    show_on_create: false,
    show_in_list: false,
    is_universal: false,
    universal_request_status: "pending",
    status: "active",
    sort_order: id,
    created_by: { id: 9, name: agent },
    created_at: new Date(Date.UTC(2026, 10, id)).toISOString(),
    usage_count: usage,
  };
}

const many = Array.from({ length: 23 }, (_, index) => request(index + 1, `Field ${index + 1}`));

function openPanel(fields: LeadFieldDefinition[]) {
  render(<FieldRequestsBanner fields={fields} companyId={1} />);
  fireEvent.click(screen.getByRole("button", { name: /field requests? waiting for review/ }));
  return screen.getByRole("dialog", { name: "Field requests" });
}

describe("FieldRequestsBanner", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ data: {} });
  });

  it("is one line with the count, whatever the number of requests", () => {
    render(<FieldRequestsBanner fields={many} companyId={1} />);
    expect(screen.getByText("23 field requests waiting for review")).toBeTruthy();
    // No request rows on the page until the panel is opened.
    expect(screen.queryByText("Field 1")).toBeNull();
  });

  it("renders nothing without pending requests", () => {
    const { container } = render(
      <FieldRequestsBanner fields={[{ ...request(1, "Industry"), universal_request_status: "approved", is_universal: true }]} companyId={1} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows 10 requests at a time with Show more", () => {
    const dialog = openPanel(many);
    expect(within(dialog).getAllByRole("button", { name: "Approve" })).toHaveLength(10);
    fireEvent.click(within(dialog).getByRole("button", { name: /Showing 10 of 23/ }));
    expect(within(dialog).getAllByRole("button", { name: "Approve" })).toHaveLength(20);
  });

  it("searches by field name or agent", () => {
    const dialog = openPanel([request(1, "Founded", "Siro", 4), request(2, "Shut Down", "Donald")]);
    fireEvent.change(within(dialog).getByLabelText("Search field requests"), { target: { value: "donald" } });
    expect(within(dialog).queryByText("Founded")).toBeNull();
    expect(within(dialog).getByText("Shut Down")).toBeTruthy();
  });

  it("shows who asked and how many leads use the field", () => {
    const dialog = openPanel([request(1, "Founded", "Siro", 4)]);
    expect(within(dialog).getByText(/Siro · .* ago · on 4 leads/)).toBeTruthy();
  });

  it("approves a request and removes it from the list", async () => {
    const dialog = openPanel([request(1, "Founded"), request(2, "Shut Down")]);
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Approve" })[1]);

    await waitFor(() => expect(within(dialog).queryByText("Founded")).toBeNull());
    expect(mutateAsync).toHaveBeenCalledWith({ fieldId: 1, action: "approve", payload: { company_id: 1, reason: undefined } });
  });

  it("asks for a reason only after Decline", async () => {
    const dialog = openPanel([request(1, "Founded")]);
    expect(within(dialog).queryByLabelText("Decline reason for Founded")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Decline" }));
    fireEvent.change(within(dialog).getByLabelText("Decline reason for Founded"), { target: { value: "Use Industry" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm decline" }));

    await waitFor(() => expect(within(dialog).getByText("All field requests are handled.")).toBeTruthy());
    expect(mutateAsync).toHaveBeenCalledWith({ fieldId: 1, action: "decline", payload: { company_id: 1, reason: "Use Industry" } });
  });

  it("approves several selected requests at once", async () => {
    const dialog = openPanel([request(1, "Founded"), request(2, "Shut Down"), request(3, "Primary Reason")]);
    fireEvent.click(within(dialog).getByLabelText("Select Founded"));
    fireEvent.click(within(dialog).getByLabelText("Select Shut Down"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve 2" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(dialog).queryByText("Founded")).toBeNull());
    expect(within(dialog).getByText("Primary Reason")).toBeTruthy();
  });
});
