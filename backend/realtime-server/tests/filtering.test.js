import test from "node:test";
import assert from "node:assert/strict";

import { resolveAccessRole, shouldDeliverEvent } from "../src/filtering.js";

test("resolveAccessRole classifies management roles", () => {
  assert.equal(resolveAccessRole("admin"), "management");
  assert.equal(resolveAccessRole("owner"), "management");
  assert.equal(resolveAccessRole("supervisor"), "management");
  assert.equal(resolveAccessRole("agent"), "agent");
  assert.equal(resolveAccessRole(null), "agent");
});

test("shouldDeliverEvent allows management for same company", () => {
  const connection = {
    authenticated: true,
    companyId: 5,
    accessRole: "management",
    userId: 10,
    subscribedTaskIds: new Set(),
  };

  const envelope = {
    company_id: 5,
    user_id: 99,
    task_id: 123,
  };

  assert.equal(shouldDeliverEvent(connection, envelope), true);
});

test("shouldDeliverEvent restricts agents to own events or subscribed task", () => {
  const connection = {
    authenticated: true,
    companyId: 5,
    accessRole: "agent",
    userId: 10,
    subscribedTaskIds: new Set([123]),
  };

  assert.equal(
    shouldDeliverEvent(connection, {
      company_id: 5,
      user_id: 10,
      task_id: 500,
    }),
    true,
  );

  assert.equal(
    shouldDeliverEvent(connection, {
      company_id: 5,
      user_id: 99,
      task_id: 123,
    }),
    true,
  );

  assert.equal(
    shouldDeliverEvent(connection, {
      company_id: 5,
      user_id: 99,
      task_id: 999,
    }),
    false,
  );
});

test("shouldDeliverEvent rejects mismatched company", () => {
  const connection = {
    authenticated: true,
    companyId: 5,
    accessRole: "management",
    userId: 10,
    subscribedTaskIds: new Set([123]),
  };

  assert.equal(
    shouldDeliverEvent(connection, {
      company_id: 7,
      user_id: 10,
      task_id: 123,
    }),
    false,
  );
});
