import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LeadFieldDialog } from "./lead-field-dialog";
import type { LeadFieldDefinition } from "@/lib/api/crm";

const createMutate = vi.fn();

vi.mock("@/hooks/use-crm", () => ({
  useCreateLeadField: () => ({ mutate: createMutate, isPending: false }),
  useUpdateLeadField: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/components/ui/modal-portal", () => ({
  ModalPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const founded: LeadFieldDefinition = {
  id: 7,
  company_id: 1,
  key: "founded",
  label: "Founded",
  type: "text",
  options: [],
  is_required: false,
  show_on_create: false,
  show_in_list: false,
  is_universal: false,
  status: "active",
  sort_order: 3,
  created_by: { id: 2, name: "Jane" },
};

describe("LeadFieldDialog from an import column", () => {
  it("offers the existing field instead of creating a duplicate", () => {
    const onUseExisting = vi.fn();
    const onClose = vi.fn();

    render(
      <LeadFieldDialog
        companyId={1}
        apiBasePath="/admin"
        initialLabel="Founded"
        existingFields={[founded]}
        onUseExisting={onUseExisting}
        onClose={onClose}
      />,
    );

    expect(screen.getByText(/already exists as a lead-only field \(created by Jane/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add field" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Use this field" }));

    expect(onUseExisting).toHaveBeenCalledWith(founded);
    expect(onClose).toHaveBeenCalled();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("creates normally when the name is free", () => {
    render(
      <LeadFieldDialog
        companyId={1}
        apiBasePath="/admin"
        initialLabel="Shut Down"
        existingFields={[founded]}
        onUseExisting={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Use this field" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Shut Down", make_universal: false }),
      expect.anything(),
    );
  });
});
