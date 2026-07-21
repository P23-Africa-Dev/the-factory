import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, ApiRequestError } from "@/lib/api/onboarding";
import {
  getSupportLevelFromDocument,
  isSupportSessionActiveInDocument,
  SUPPORT_ACTIVE_COOKIE,
  SUPPORT_LEVEL_COOKIE,
} from "@/lib/auth/support-session";

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; Path=/`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0`;
}

describe("support session client transport", () => {
  beforeEach(() => {
    clearCookie(SUPPORT_ACTIVE_COOKIE);
    clearCookie(SUPPORT_LEVEL_COOKIE);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearCookie(SUPPORT_ACTIVE_COOKIE);
    clearCookie(SUPPORT_LEVEL_COOKIE);
  });

  it("detects the public support marker and access level", () => {
    setCookie(SUPPORT_ACTIVE_COOKIE, "1");
    setCookie(SUPPORT_LEVEL_COOKIE, "read_only");

    expect(isSupportSessionActiveInDocument()).toBe(true);
    expect(getSupportLevelFromDocument()).toBe("read_only");
  });

  it("blocks mutations locally during read-only support", async () => {
    setCookie(SUPPORT_ACTIVE_COOKIE, "1");
    setCookie(SUPPORT_LEVEL_COOKIE, "read_only");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest({
        method: "POST",
        path: "/tasks",
        body: { name: "Blocked" },
        token: "customer-token",
      }),
    ).rejects.toBeInstanceOf(ApiRequestError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("routes operational requests through the same-origin proxy without exposing a token", async () => {
    setCookie(SUPPORT_ACTIVE_COOKIE, "1");
    setCookie(SUPPORT_LEVEL_COOKIE, "operational_full");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          message: "Created",
          data: { id: 1 },
          errors: null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest({
      method: "POST",
      path: "/tasks",
      body: { name: "Support task" },
      token: "customer-token",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/support/proxy/tasks",
      expect.objectContaining({
        method: "POST",
        headers: expect.not.objectContaining({
          Authorization: expect.anything(),
        }),
      }),
    );
  });
});
