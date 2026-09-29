import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AddLeadModal } from "@/components/crm/add-lead-modal";
import { useAuthStore, type AuthUser } from "@/store/auth";

const mocks = vi.hoisted(() => ({
  createLead: vi.fn(),
  updateLead: vi.fn(),
}));

vi.mock("@/hooks/use-crm", () => ({
  useCreateLead: () => ({ mutate: mocks.createLead, isPending: false }),
  useUpdateLead: () => ({ mutate: mocks.updateLead, isPending: false }),
  useLeadDuplicateSuggestions: (params: { q?: string; field?: string; enabled?: boolean }) => {
    if (!params.enabled) return { data: [], isFetching: false };
    if (params.field === "name" && params.q === "Ada Lovelace") {
      return {
        data: [{
          id: 4,
          name: "Ada Lovelace",
          email: "ada@example.com",
          phone: null,
          company_name: "Analytical Engines",
          matched_on: "name",
          match_type: "exact",
          can_merge: true,
        }],
        isFetching: false,
      };
    }
    if (params.field === "name" && params.q === "Ada") {
      return {
        data: [{
          id: 4,
          name: "Ada Lovelace",
          email: "ada@example.com",
          phone: null,
          company_name: "Analytical Engines",
          matched_on: "name",
          match_type: "partial",
          can_merge: true,
        }],
        isFetching: false,
      };
    }
    return { data: [], isFetching: false };
  },
  usePreviewLeadMerge: () => ({ mutate: vi.fn(), isPending: false }),
  useApplyLeadMerge: () => ({ mutate: vi.fn(), isPending: false }),
  useCrmAssignees: () => ({
    data: [
      { id: 7, name: "Owner User", email: "owner@example.com", role: "owner" },
      { id: 8, name: "Agent User", email: "agent@example.com", role: "agent" },
    ],
    isLoading: false,
  }),
  useCrmPipelines: () => ({ data: [{ id: 3, name: "Sales", is_default: true }] }),
  useCrmLabels: () => ({ data: [{ slug: "newly_lead", name: "New Lead" }] }),
  useCrmPreferences: () => ({ data: { preferred_pipeline_id: 3, company_default_pipeline_id: 3 } }),
}));

vi.mock("@/components/payroll/payroll/inline-select", () => ({
  InlineSelect: ({
    value,
    onChange,
    options,
  }: {
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
  }) => (
    <select
      aria-label={options.some((option) => option.label === "Owner User") ? "Assignee" : "Inline select"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  ),
}));

vi.mock("@/components/ui/phone-number-input", () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="Phone" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

vi.mock("@/components/crm/profile-url-inputs", () => ({
  ProfileUrlInputs: () => null,
}));

describe("AddLeadModal", () => {
  beforeEach(() => {
    mocks.createLead.mockReset();
    mocks.updateLead.mockReset();
    useAuthStore.setState({
      user: {
        id: 7,
        name: "Owner User",
        email: "owner@example.com",
        avatar: null,
        active_company: {
          id: 12,
          company_id: "FAC-12",
          name: "Factory",
          role: "owner",
        },
      } as AuthUser,
    });
  });

  it("preselects the logged-in manager and submits the ordered contact array", () => {
    render(<AddLeadModal onClose={vi.fn()} />);

    expect((screen.getByRole("combobox", { name: "Assignee" }) as HTMLSelectElement).value).toBe("7");

    fireEvent.change(screen.getByPlaceholderText("E.g John Doe"), {
      target: { value: "Primary Person" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add another contact" }));
    fireEvent.change(screen.getByPlaceholderText("E.g John Doe"), {
      target: { value: "Secondary Person" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(mocks.createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        assigned_to_user_id: 7,
        name: "Primary Person",
        contacts: [
          expect.objectContaining({ name: "Primary Person", sort_order: 0 }),
          expect.objectContaining({ name: "Secondary Person", sort_order: 1 }),
        ],
      }),
      expect.any(Object),
    );
  });

  it("preserves an unassigned lead in edit mode", () => {
    render(
      <AddLeadModal
        onClose={vi.fn()}
        lead={{
          id: 99,
          company_id: 12,
          created_by_user_id: 7,
          assigned_to_user_id: null,
          name: "Existing Lead",
          contacts: [{ name: "Existing Lead", sort_order: 0 }],
        }}
      />,
    );

    expect((screen.getByRole("combobox", { name: "Assignee" }) as HTMLSelectElement).value).toBe("");
  });

  it("shows existing leads while typing and offers merge only for an exact match", async () => {
    render(<AddLeadModal onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("E.g John Doe"), {
      target: { value: "Ada" },
    });

    expect(await screen.findByRole("option", { name: /Ada Lovelace/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Merge" })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("E.g John Doe"), {
      target: { value: "Ada Lovelace" },
    });

    expect(await screen.findByRole("button", { name: "Merge" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save as new lead" }));

    await waitFor(() => {
      expect(mocks.createLead).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Ada Lovelace" }),
        expect.any(Object),
      );
    });
  });
});
