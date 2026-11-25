import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/lib/api/onboarding";
import type { DriveFile, DriveFolder } from "@/lib/api/drive";
import { DriveView } from "./drive-view";
import { makeDriveFile, makeDriveFolder } from "./drive-test-fixtures";

const state = vi.hoisted(() => ({
  folders: [] as DriveFolder[],
  files: [] as DriveFile[],
  deleteMutateAsync: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/store/auth", () => ({
  useAuthStore: () => ({ user: { id: 1 } }),
}));

vi.mock("@/lib/company-context", () => ({
  getActiveCompanyContext: () => ({ apiCompanyId: 10, role: "owner" }),
}));

vi.mock("./drive-quick-preview", () => ({ DriveQuickPreview: () => null }));
vi.mock("./drive-preview-modal", () => ({ DrivePreviewModal: () => null }));
vi.mock("./drive-share-modal", () => ({ DriveShareModal: () => null }));

vi.mock("@/hooks/use-drive", () => {
  const idle = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
    useDriveUsage: () => ({ data: undefined, isLoading: false }),
    useDriveFolders: () => ({ data: state.folders, isLoading: false }),
    useDriveFiles: () => ({ data: { items: state.files }, isLoading: false }),
    useCreateDriveFolder: idle,
    useUploadDriveFile: idle,
    useDownloadDriveFile: idle,
    useSyncDriveGrants: idle,
    useDeleteDriveFile: () => ({ mutate: vi.fn(), mutateAsync: state.deleteMutateAsync, isPending: false }),
  };
});

describe("DriveView", () => {
  beforeEach(() => {
    state.folders = [makeDriveFolder()];
    state.files = [makeDriveFile({ id: 5, original_name: "Q3 plan.pdf" })];
    state.deleteMutateAsync = vi.fn().mockResolvedValue({ success: true });
  });

  async function openDeleteDialog() {
    render(<DriveView />);
    fireEvent.click(screen.getByTitle("Delete"));
    const description = await screen.findByText(
      /"Q3 plan.pdf" will be permanently deleted\. This can't be undone\./,
    );
    return within(description.parentElement as HTMLElement);
  }

  it("asks for confirmation and does nothing on cancel", async () => {
    const dialog = await openDeleteDialog();
    expect(state.deleteMutateAsync).not.toHaveBeenCalled();

    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByText(/will be permanently deleted/)).toBeNull());
    expect(state.deleteMutateAsync).not.toHaveBeenCalled();
  });

  it("deletes the file on confirm", async () => {
    const dialog = await openDeleteDialog();
    fireEvent.click(dialog.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(state.deleteMutateAsync).toHaveBeenCalledWith({ fileId: 5, company_id: 10 }),
    );
    await waitFor(() => expect(screen.queryByText(/will be permanently deleted/)).toBeNull());
  });

  it("keeps the dialog open and shows the server message when delete fails", async () => {
    state.deleteMutateAsync = vi
      .fn()
      .mockRejectedValue(new ApiRequestError("Drive storage is unavailable. Please try again later.", 503));

    const dialog = await openDeleteDialog();
    fireEvent.click(dialog.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Drive storage is unavailable. Please try again later.")).toBeTruthy();
    expect(screen.getByText(/will be permanently deleted/)).toBeTruthy();
  });

  it("shows the auto-delete date under expiring files", () => {
    state.files = [
      makeDriveFile({ id: 6, source: "ely_report", expires_at: "2027-01-05T12:00:00Z" }),
      makeDriveFile({ id: 7, original_name: "kept.pdf", expires_at: null }),
    ];
    render(<DriveView />);
    expect(screen.getAllByText("Auto-deletes on Jan 5, 2027")).toHaveLength(1);
  });

  it("explains ELY report retention in the ELY Reports folder only", () => {
    state.folders = [
      makeDriveFolder({ id: 2, name: "ELY Reports", is_system: true, system_key: "ely_reports" }),
      makeDriveFolder({ id: 3, name: "Contracts" }),
    ];
    render(<DriveView />);
    const note = "ELY reports are kept for 60 days, then removed automatically.";
    expect(screen.getByText(note)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Contracts" }));
    expect(screen.queryByText(note)).toBeNull();
  });
});
