export const buildHealthPayload = ({ redisStatus, connectionCount, uptimeSeconds }) => {
    const isReady = redisStatus === "ready";

    return {
        status: isReady ? "ok" : "degraded",
        service: "factory23-realtime-relay",
        redis: {
            status: redisStatus,
            ready: isReady,
        },
        connections: connectionCount,
        uptime_seconds: uptimeSeconds,
        timestamp: new Date().toISOString(),
    };
};

export const createHealthResponse = ({ redisStatus, connectionCount, uptimeSeconds }) => {
    const body = buildHealthPayload({ redisStatus, connectionCount, uptimeSeconds });

    return {
        statusCode: body.status === "ok" ? 200 : 503,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
        },
        body,
    };
};