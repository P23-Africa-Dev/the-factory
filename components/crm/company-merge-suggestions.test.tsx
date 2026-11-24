import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyMergeSuggestions } from "./company-merge-suggestions";
import type { LeadCompanyGroup } from "@/lib/api/crm";

const mutateAsync = vi.fn();
let groups: LeadCompanyGroup[] = [];

vi.mock("@/hooks/use-crm", () => ({
  useLeadCompanyGroups: () => ({ data: groups, isLoading: false, isError: false }),
  useMergeLeadsByCompany: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const lead = (id: number, name: string, isNew: boolean) => ({
  id,
  name,
  contact_name: name,
  email: null,
  company_name: "P23 Africa",
  status: "newly_lead",
  status_name: "New Lead",
  created_at: "2026-11-12T09:00:00Z",
  is_new: isNew,
});

describe("CompanyMergeSuggestions", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    groups = [
      {
        key: "p23 africa",
        company_name: "P23 Africa",
        survivor_id: 3,
        can_merge: true,
        leads: [lead(3, "Salim", false), lead(7, "Donald", true), lead(8, "Siro", true)],
      },
      {
        key: "acme",
        company_name: "Acme",
        survivor_id: 9,
        can_merge: true,
        leads: [
          { ...lead(9, "Jane", true), company_name: "Acme" },
          { ...lead(10, "Paul", true), company_name: "Acme" },
        ],
      },
    ];
  });

  it("lists each company with its people, new and existing", () => {
    render(<CompanyMergeSuggestions companyId={1} apiBasePath="/admin" leadIds={[7, 8, 9, 10]} />);

    expect(screen.getByText("Same company, several leads")).toBeTruthy();
    expect(screen.getByText(/Salim \(existing, .+\) · Donald \(new\) · Siro \(new\)/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Merge all (2)" })).toBeTruthy();
  });

  it("merges one company and links to the merged lead", async () => {
    mutateAsync.mockResolvedValue({ data: { lead: { id: 3 }, merged_count: 2, merged_lead_ids: [7, 8] } });
    render(<CompanyMergeSuggestions companyId={1} apiBasePath="/admin" leadIds={[7, 8, 9, 10]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Merge" })[0]);

    await waitFor(() => expect(screen.getByRole("link", { name: "View" })).toBeTruthy());
    expect(mutateAsync).toHaveBeenCalledWith({ company_id: 1, lead_ids: [3, 7, 8] });
    expect(screen.getByRole("link", { name: "View" }).getAttribute("href")).toBe("/crm/leads/3");
  });

  it("keeps a company separate without calling the API", () => {
    render(<CompanyMergeSuggestions companyId={1} apiBasePath="/agent" leadIds={[7, 8, 9, 10]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Keep separate" })[1]);

    expect(screen.getByText("Acme kept as 2 separate leads.")).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("asks agents without access to get a manager", () => {
    groups = [{ ...groups[0], can_merge: false }];
    render(<CompanyMergeSuggestions companyId={1} apiBasePath="/agent" leadIds={[7]} />);

    expect(screen.getByText("Ask a manager to merge")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Merge" })).toBeNull();
  });

  it("renders nothing when no leads were imported or no groups exist", () => {
    groups = [];
    const { container } = render(<CompanyMergeSuggestions companyId={1} apiBasePath="/admin" leadIds={[7]} />);
    expect(container.innerHTML).toBe("");
  });
});
