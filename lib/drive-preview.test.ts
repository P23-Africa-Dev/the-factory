import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/lib/api/onboarding";
import { formatDriveExpiryNote, getDrivePreviewError } from "./drive-preview";

describe("getDrivePreviewError", () => {
  it("maps 404 to a no-longer-available message without download", () => {
    expect(getDrivePreviewError(new ApiRequestError("gone", 404))).toEqual({
      message: "This file is no longer available.",
      canDownload: false,
    });
  });

  it("maps 503 to a storage-unavailable message", () => {
    expect(getDrivePreviewError(new ApiRequestError("down", 503)).message).toBe(
      "Drive storage is unavailable right now. Please try again later.",
    );
  });

  it("maps 403 to a no-access message", () => {
    expect(getDrivePreviewError(new ApiRequestError("nope", 403)).message).toBe(
      "You don't have access to this file.",
    );
  });

  it("falls back to the generic message and allows download otherwise", () => {
    expect(getDrivePreviewError(new ApiRequestError("boom", 500))).toEqual({
      message: "Could not load preview",
      canDownload: true,
    });
    expect(getDrivePreviewError(new Error("network"))).toEqual({
      message: "Could not load preview",
      canDownload: true,
    });
    expect(getDrivePreviewError(null).canDownload).toBe(true);
  });
});

describe("formatDriveExpiryNote", () => {
  it("formats an ISO date", () => {
    expect(formatDriveExpiryNote("2027-01-05T12:00:00Z")).toBe("Auto-deletes on Jan 5, 2027");
  });

  it("returns null for missing or invalid dates", () => {
    expect(formatDriveExpiryNote(null)).toBeNull();
    expect(formatDriveExpiryNote(undefined)).toBeNull();
    expect(formatDriveExpiryNote("not-a-date")).toBeNull();
  });
});
