import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api/onboarding";
import { DrivePreviewModal } from "./drive-preview-modal";
import { DriveQuickPreview } from "./drive-quick-preview";
import { makeDriveFile } from "./drive-test-fixtures";

const blobState = vi.hoisted(() => ({
  current: { blobUrl: null as string | null, isLoading: false, isError: false, error: null as unknown },
}));

vi.mock("@/hooks/use-drive-preview", () => ({
  useDriveFileBlobUrl: () => blobState.current,
}));

function failWith(status: number) {
  blobState.current = {
    blobUrl: null,
    isLoading: false,
    isError: true,
    error: new ApiRequestError("server says no", status),
  };
}

describe("DrivePreviewModal errors", () => {
  beforeEach(() => {
    blobState.current = { blobUrl: null, isLoading: false, isError: false, error: null };
  });

  const renderModal = () =>
    render(<DrivePreviewModal file={makeDriveFile()} companyId={10} onClose={vi.fn()} onDownload={vi.fn()} />);

  it.each([
    [404, "This file is no longer available."],
    [503, "Drive storage is unavailable right now. Please try again later."],
    [403, "You don't have access to this file."],
  ])("shows the mapped message for %i and hides Download instead", async (status, message) => {
    failWith(status);
    renderModal();
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("Download instead")).toBeNull();
  });

  it("keeps the generic message with a download fallback for other errors", async () => {
    failWith(500);
    renderModal();
    expect(await screen.findByText("Could not load preview")).toBeTruthy();
    expect(screen.getByText("Download instead")).toBeTruthy();
  });

  it("shows the expiry note in the header", async () => {
    render(
      <DrivePreviewModal
        file={makeDriveFile({ source: "ely_report", expires_at: "2027-01-05T12:00:00Z" })}
        companyId={10}
        onClose={vi.fn()}
        onDownload={vi.fn()}
      />,
    );
    expect(await screen.findByText(/Auto-deletes on Jan 5, 2027/)).toBeTruthy();
  });
});

describe("DriveQuickPreview errors", () => {
  it("shows the mapped message", () => {
    failWith(404);
    render(<DriveQuickPreview file={makeDriveFile()} companyId={10} onOpenFullPreview={vi.fn()} />);
    expect(screen.getByText("This file is no longer available.")).toBeTruthy();
  });
});
