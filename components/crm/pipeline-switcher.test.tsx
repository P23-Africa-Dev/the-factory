import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PipelineSwitcher } from "@/components/crm/pipeline-switcher";
import type { CrmPipeline } from "@/lib/api/crm";

const pipelines = [
  { id: 1, company_id: 1, name: "Sales", currency_code: "USD", is_default: true, sort_order: 0 },
  { id: 2, company_id: 1, name: "Partners", currency_code: "USD", is_default: false, sort_order: 1 },
] as CrmPipeline[];

describe("PipelineSwitcher", () => {
  it("switches pipeline in one click and closes", () => {
    const onSelect = vi.fn();
    render(
      <PipelineSwitcher pipelines={pipelines} selectedPipelineId={1} defaultPipelineId={1} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Sales/ }));
    fireEvent.click(screen.getByRole("option", { name: /Partners/ }));

    expect(onSelect).toHaveBeenCalledWith(2);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("offers All pipelines and the manage action", () => {
    const onSelect = vi.fn();
    const onManage = vi.fn();
    render(
      <PipelineSwitcher
        pipelines={pipelines}
        selectedPipelineId={2}
        defaultPipelineId={1}
        onSelect={onSelect}
        onManage={onManage}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Partners/ });
    expect(trigger.getAttribute("aria-pressed")).toBe("true"); // non-default pipeline = active filter

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: "All pipelines" }));
    expect(onSelect).toHaveBeenCalledWith(null);

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: /Manage pipelines/ }));
    expect(onManage).toHaveBeenCalled();
  });
});
