import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDriveFileBlob } from "./drive";
import { ApiRequestError } from "./onboarding";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchDriveFileBlob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the blob on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("hello", { status: 200 })));
    const blob = await fetchDriveFileBlob("token", 7, 3);
    expect(await blob.text()).toBe("hello");
  });

  it.each([
    [404, "File not found."],
    [503, "Drive storage is unavailable right now."],
    [403, "This action is unauthorized."],
  ])("keeps status %i and the server message", async (status, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(status, { success: false, message })));

    const error = await fetchDriveFileBlob("token", 7, 3).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(status);
    expect((error as ApiRequestError).message).toBe(message);
  });

  it("falls back to a generic message when the body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 })));

    const error = await fetchDriveFileBlob("token", 7).catch((e: unknown) => e);
    expect((error as ApiRequestError).status).toBe(502);
    expect((error as ApiRequestError).message).toBe("Unable to load file preview");
  });
});
