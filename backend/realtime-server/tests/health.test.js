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