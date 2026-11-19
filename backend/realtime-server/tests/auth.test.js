import test from "node:test";
import assert from "node:assert/strict";

import { authenticateSocket, SocketAuthError } from "../src/auth.js";

const withFetch = async (impl, fn) => {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
};

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test("authenticateSocket sends company + task ids and maps supervisor scope", async () => {
  let calledUrl;
  let calledAuth;

  await withFetch(
    async (url, init) => {
      calledUrl = new URL(String(url));
      calledAuth = init.headers.Authorization;
      return jsonResponse(200, {
        data: {
          user: { id: 7, name: "Sup", email: "s@example.test" },
          company: { id: 5, company_id: "FAC-5" },
          company_role: "supervisor",
          access_role: "management",
          scope: "supervisor",
          visible_user_ids: [20, 21],
          allowed_task_ids: [3],
        },
      });
    },
    async () => {
      const identity = await authenticateSocket({ token: "tok", companyHint: "5", taskIds: [3, 4] });

      assert.equal(calledUrl.pathname, "/api/v1/tracking/socket-authorization");
      assert.equal(calledUrl.searchParams.get("company_id"), "5");
      assert.equal(calledUrl.searchParams.get("task_ids"), "3,4");
      assert.equal(calledAuth, "Bearer tok");

      assert.equal(identity.companyId, 5);
      assert.equal(identity.scope, "supervisor");
      assert.deepEqual([...identity.visibleUserIds], [20, 21]);
      assert.deepEqual([...identity.allowedTaskIds], [3]);
    },
  );
});

test("company scope has no user restriction", async () => {
  await withFetch(
    async () =>
      jsonResponse(200, {
        data: {
          user: { id: 1 },
          company: { id: 5 },
          access_role: "management",
          scope: "company",
          visible_user_ids: null,
          allowed_task_ids: [],
        },
      }),
    async () => {
      const identity = await authenticateSocket({ token: "tok" });
      assert.equal(identity.visibleUserIds, null);
    },
  );
});

test("422 from the API is a permanent auth failure", async () => {
  await withFetch(
    async () => jsonResponse(422, { message: "invalid", errors: { company_id: ["Not attached."] } }),
    async () => {
      await assert.rejects(
        authenticateSocket({ token: "tok", companyHint: "99" }),
        (error) => error instanceof SocketAuthError && error.permanent === true && /Not attached/.test(error.message),
      );
    },
  );
});

test("5xx / network errors are retryable", async () => {
  await withFetch(
    async () => jsonResponse(502, {}),
    async () => {
      await assert.rejects(
        authenticateSocket({ token: "tok" }),
        (error) => error instanceof SocketAuthError && error.permanent === false,
      );
    },
  );

  await withFetch(
    async () => {
      throw new Error("ECONNREFUSED");
    },
    async () => {
      await assert.rejects(
        authenticateSocket({ token: "tok" }),
        (error) => error instanceof SocketAuthError && error.permanent === false,
      );
    },
  );
});

test("missing token is rejected without calling the API", async () => {
  await assert.rejects(authenticateSocket({ token: "" }), (error) => error.permanent === true);
});
