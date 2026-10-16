import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SalesEngineAccessGate } from "./sales-engine-access-gate";

describe("SalesEngineAccessGate", () => {
  it("renders declined state with restricted access guidance and admin contact option", () => {
    const html = renderToStaticMarkup(
      <SalesEngineAccessGate
        state="declined"
        onRequestAccess={vi.fn()}
        onLoginLink={vi.fn()}
        isRequesting={false}
        isLoggingIn={false}
      />
    );

    expect(html).toContain("Access Restricted");
    expect(html).toContain("Access Not Available");
    expect(html).toContain("Why is access restricted?");
    expect(html).toContain("Contact Administrator");
    expect(html).toContain("Return to CRM Leads");
    expect(html).toContain("Already have a Sales Engine account? Sign in");
  });

  it("renders pending state with approval progress tracker and refresh button", () => {
    const html = renderToStaticMarkup(
      <SalesEngineAccessGate
        state="pending"
        onRequestAccess={vi.fn()}
        onLoginLink={vi.fn()}
        isRequesting={false}
        isLoggingIn={false}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />
    );

    expect(html).toContain("Request In Review");
    expect(html).toContain("Access Request Pending");
    expect(html).toContain("Approval Progress");
    expect(html).toContain("Request Submitted");
    expect(html).toContain("Administrator Review");
    expect(html).toContain("Workspace Activation");
    expect(html).toContain("Refresh Status");
  });

  it("renders needs_access state with value propositions and request access action", () => {
    const html = renderToStaticMarkup(
      <SalesEngineAccessGate
        state="needs_access"
        onRequestAccess={vi.fn()}
        onLoginLink={vi.fn()}
        isRequesting={false}
        isLoggingIn={false}
      />
    );

    expect(html).toContain("Sales Intelligence");
    expect(html).toContain("What you unlock with Sales Engine");
    expect(html).toContain("AI Prospecting");
    expect(html).toContain("Social Signals");
    expect(html).toContain("CRM Enrichment");
    expect(html).toContain("Request Access");
  });

  it("renders error state with retry button", () => {
    const html = renderToStaticMarkup(
      <SalesEngineAccessGate
        state="error"
        message="Custom network connection error"
        onRequestAccess={vi.fn()}
        onLoginLink={vi.fn()}
        isRequesting={false}
        isLoggingIn={false}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />
    );

    expect(html).toContain("Verification Notice");
    expect(html).toContain("Access Verification Failed");
    expect(html).toContain("Custom network connection error");
    expect(html).toContain("Retry Verification");
  });
});
