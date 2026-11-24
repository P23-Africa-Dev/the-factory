import test from "node:test";
import assert from "node:assert/strict";

import { resolveAccessRole, shouldDeliverEvent } from "../src/filtering.js";

const conn = (overrides = {}) => ({
  authenticated: true,
  companyId: 5,
  userId: 10,
  accessRole: "management",
  scope: "company",
  visibleUserIds: null,
  subscribedTaskIds: new Set(),
  ...overrides,
});

test("resolveAccessRole classifies management roles", () => {
  assert.equal(resolveAccessRole("admin"), "management");
  assert.equal(resolveAccessRole("owner"), "management");
  assert.equal(resolveAccessRole("supervisor"), "management");
  assert.equal(resolveAccessRole("manager"), "management");
  assert.equal(resolveAccessRole("agent"), "agent");
  assert.equal(resolveAccessRole(null), "agent");
});

test("company scope (owner/admin) receives every event in the company", () => {
  assert.equal(shouldDeliverEvent(conn(), { company_id: 5, user_id: 99, task_id: 123 }), true);
});

test("supervisor scope only receives events about supervised agents", () => {
  const supervisor = conn({ scope: "supervisor", visibleUserIds: new Set([20, 21]) });

  assert.equal(shouldDeliverEvent(supervisor, { company_id: 5, user_id: 20, task_id: 1 }), true);
  assert.equal(shouldDeliverEvent(supervisor, { company_id: 5, user_id: 99, task_id: 1 }), false);
});

test("supervisor sees reassignments involving their agents", () => {
  const supervisor = conn({ scope: "supervisor", visibleUserIds: new Set([20]) });

  assert.equal(
    shouldDeliverEvent(supervisor, {
      company_id: 5,
      user_id: 1,
      task_id: 7,
      data: { from_user_id: 99, to_user_id: 20 },
    }),
    true,
  );
});

test("supervisor with no agents receives nothing", () => {
  const supervisor = conn({ scope: "supervisor", visibleUserIds: new Set() });
  assert.equal(shouldDeliverEvent(supervisor, { company_id: 5, user_id: 20, task_id: 1 }), false);
});

test("agent scope receives own events and authorized tasks only", () => {
  const agent = conn({ accessRole: "agent", scope: "self", subscribedTaskIds: new Set([123]) });

  assert.equal(shouldDeliverEvent(agent, { company_id: 5, user_id: 10, task_id: 500 }), true);
  assert.equal(shouldDeliverEvent(agent, { company_id: 5, user_id: 99, task_id: 123 }), true);
  assert.equal(shouldDeliverEvent(agent, { company_id: 5, user_id: 99, task_id: 999 }), false);
});

test("connection without a scope fails closed to self", () => {
  const legacy = conn({ scope: undefined });
  assert.equal(shouldDeliverEvent(legacy, { company_id: 5, user_id: 99, task_id: 1 }), false);
  assert.equal(shouldDeliverEvent(legacy, { company_id: 5, user_id: 10, task_id: 1 }), true);
});

test("events from another company are never delivered", () => {
  assert.equal(shouldDeliverEvent(conn(), { company_id: 7, user_id: 10, task_id: 123 }), false);
});

test("unauthenticated connections receive nothing", () => {
  assert.equal(shouldDeliverEvent(conn({ authenticated: false }), { company_id: 5, user_id: 10 }), false);
});
