import test from "node:test";
import assert from "node:assert/strict";

import { buildHealthPayload, createHealthResponse } from "../src/health.js";

test("buildHealthPayload reports ok when redis is ready", () => {
    const payload = buildHealthPayload({
        redisStatus: "ready",
        connectionCount: 4,
        uptimeSeconds: 32,
    });

    assert.equal(payload.status, "ok");
    assert.equal(payload.redis.ready, true);
    assert.equal(payload.connections, 4);
    assert.equal(payload.uptime_seconds, 32);
});

test("createHealthResponse reports degraded when redis is not ready", () => {
    const response = createHealthResponse({
        redisStatus: "reconnecting",
        connectionCount: 0,
        uptimeSeconds: 3,
    });

    assert.equal(response.statusCode, 503);
    assert.equal(response.body.status, "degraded");
    assert.equal(response.body.redis.ready, false);
    assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
});
test("rolling counter drops events older than the window", async () => {
    const { createRollingCounter } = await import("../src/health.js");
    let t = 0;
    const counter = createRollingCounter(15 * 60 * 1000, () => t);

    counter.increment();
    counter.increment();
    t = 5 * 60 * 1000;
    counter.increment();
    assert.equal(counter.total(), 3);

    t = 16 * 60 * 1000; // first two (minute 0) fall out of the 15-min window
    assert.equal(counter.total(), 1);

    t = 21 * 60 * 1000;
    assert.equal(counter.total(), 0);
});

test("health payload includes auth counters when provided", () => {
    const payload = buildHealthPayload({
        redisStatus: "ready",
        connectionCount: 1,
        uptimeSeconds: 1,
        auth: { window_seconds: 900, successes: 3, failures: 1, permanent_failures: 1 },
    });

    assert.equal(payload.auth.failures, 1);
});
