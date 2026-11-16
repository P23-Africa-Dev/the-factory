import { fireEvent, render, screen } from "@testing-library/react";
import { format, subDays } from "date-fns";
import { describe, expect, it, vi } from "vitest";
import { CrmFilterBar, EMPTY_DATE_RANGE } from "./crm-filter-bar";
import type { CrmAssignee, CrmLabel, CrmPipeline } from "@/lib/api/crm";

describe("CrmFilterBar", () => {
  const pipelines: CrmPipeline[] = [
    { id: 101, company_id: 1, name: "Outbound Sales", currency_code: "USD", is_default: false, sort_order: 1 },
    { id: 202, company_id: 1, name: "Enterprise Deals", currency_code: "USD", is_default: true, sort_order: 0 },
  ];

  const labels: CrmLabel[] = [
    { id: 1, company_id: 1, name: "New Lead", slug: "newly_lead", color: "#3B82F6", sort_order: 0, is_default: true },
    { id: 2, company_id: 1, name: "Contacted", slug: "contacted", color: "#F59E0B", sort_order: 1, is_default: false },
  ];

  const people: CrmAssignee[] = [
    { id: 7, name: "Ada Admin", email: "ada@example.com", role: "admin" },
    { id: 9, name: "Sam Agent", email: "sam@example.com", role: "agent" },
  ];

  function renderBar(overrides: Partial<React.ComponentProps<typeof CrmFilterBar>> = {}) {
    const props: React.ComponentProps<typeof CrmFilterBar> = {
      pipelines,
      labels,
      selectedPipelineId: 202,
      defaultPipelineId: 202,
      onPipelineChange: vi.fn(),
      selectedLabel: "all",
      onLabelChange: vi.fn(),
      onClear: vi.fn(),
      ...overrides,
    };
    render(<CrmFilterBar {...props} />);
    return props;
  }

  it("displays the selected pipeline name", () => {
    renderBar();
    expect(screen.getByText("Enterprise Deals")).toBeTruthy();
  });

  it("shows placeholders when nothing is chosen", () => {
    renderBar({
      selectedPipelineId: null,
      people,
      onCreatedByChange: vi.fn(),
      dateRange: EMPTY_DATE_RANGE,
      onDateRangeChange: vi.fn(),
    });

    expect(screen.getByText("Choose a pipeline")).toBeTruthy();
    expect(screen.getByText("Choose a label")).toBeTruthy();
    expect(screen.getByText("Choose a person")).toBeTruthy();
    expect(screen.getByText("Any time")).toBeTruthy();
  });

  it("only shows the person and date fields when their handlers are passed", () => {
    renderBar();
    expect(screen.queryByText("Added by")).toBeNull();
    expect(screen.queryByText("Date added")).toBeNull();
  });

  it("disables Reset until a filter is active, then calls onClear", () => {
    const { onClear } = renderBar();
    expect((screen.getByRole("button", { name: /reset/i }) as HTMLButtonElement).disabled).toBe(true);

    document.body.innerHTML = "";
    const props = renderBar({ selectedLabel: "contacted" });
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(props.onClear).toHaveBeenCalledTimes(1);
    expect(onClear).not.toHaveBeenCalled();
  });

  it("filters by the person who added the lead and lets them be removed from the chips", () => {
    const onCreatedByChange = vi.fn();
    renderBar({ people, createdBy: "9", onCreatedByChange });

    expect(screen.getByText("Added by Sam Agent")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove filter Added by Sam Agent" }));
    expect(onCreatedByChange).toHaveBeenCalledWith("");
  });

  it("applies a quick date range", () => {
    const onDateRangeChange = vi.fn();
    renderBar({ dateRange: EMPTY_DATE_RANGE, onDateRangeChange });

    fireEvent.click(screen.getByRole("button", { name: "Date added" }));
    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));

    expect(onDateRangeChange).toHaveBeenCalledWith({
      preset: "last7",
      from: format(subDays(new Date(), 6), "yyyy-MM-dd"),
      to: format(new Date(), "yyyy-MM-dd"),
    });
  });

  it("sets a custom date range", () => {
    const onDateRangeChange = vi.fn();
    renderBar({ dateRange: { preset: null, from: "2026-11-01", to: "" }, onDateRangeChange });

    fireEvent.click(screen.getByRole("button", { name: "Date added" }));
    fireEvent.change(screen.getByLabelText("Added to"), { target: { value: "2026-11-10" } });

    expect(onDateRangeChange).toHaveBeenCalledWith({ preset: null, from: "2026-11-01", to: "2026-11-10" });
  });
});
