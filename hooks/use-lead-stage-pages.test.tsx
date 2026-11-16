import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useLeadStagePages } from "@/hooks/use-crm";

const listLeads = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getAuthTokenFromDocument: () => "token" }));
vi.mock("@/lib/auth/support-session", () => ({ hasActiveApiSession: () => true }));
vi.mock("@/lib/api/crm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/crm")>()),
  listLeads,
}));

function leadsFor(search: string | undefined) {
  const name = search ? `Match ${search}` : "Everyone";
  return {
    data: {
      items: [{ id: search ? 2 : 1, name, status: "newly_lead", updated_at: "2026-11-01" }],
      pagination: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    },
  };
}

const stages = [{ id: "newly_lead" as const, title: "New", color: "#000" }];

describe("useLeadStagePages", () => {
  it("keeps the last board on screen while a new search loads, and only reports loading on first load", async () => {
    let release: (() => void) | undefined;
    listLeads.mockImplementation((params: { search?: string }) => {
      if (!params.search) return Promise.resolve(leadsFor(undefined));
      return new Promise((resolve) => {
        release = () => resolve(leadsFor(params.search));
      });
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    // Params are a new object on every render, exactly like the CRM page passes them.
    const { result, rerender } = renderHook(
      ({ search }: { search?: string }) =>
        useLeadStagePages(stages, { company_id: 1, search, per_page: 20 }),
      { wrapper, initialProps: { search: undefined as string | undefined } },
    );

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.stages[0].leads[0]?.name).toBe("Everyone"));

    rerender({ search: "acme" });
    await waitFor(() => expect(result.current.isRefreshing).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.stages[0].leads[0]?.name).toBe("Everyone");

    release?.();
    await waitFor(() => expect(result.current.stages[0].leads[0]?.name).toBe("Match acme"));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isRefreshing).toBe(false);
  });
});
