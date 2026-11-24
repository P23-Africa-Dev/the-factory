/**
 * Rolling event counter (per-minute buckets) used to expose recent auth
 * activity on /healthz so the API's tracking:health monitor can alert on it.
 */
export const createRollingCounter = (windowMs = 15 * 60 * 1000, now = () => Date.now()) => {
    const bucketMs = 60 * 1000;
    const buckets = new Map();

    const prune = () => {
        const oldest = Math.floor((now() - windowMs) / bucketMs);
        for (const key of buckets.keys()) {
            if (key <= oldest) {
                buckets.delete(key);
            }
        }
    };

    return {
        increment() {
            const key = Math.floor(now() / bucketMs);
            buckets.set(key, (buckets.get(key) ?? 0) + 1);
            prune();
        },
        total() {
            prune();
            let sum = 0;
            for (const value of buckets.values()) {
                sum += value;
            }
            return sum;
        },
    };
};

export const buildHealthPayload = ({ redisStatus, connectionCount, uptimeSeconds, auth = null }) => {
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
        ...(auth ? { auth } : {}),
        timestamp: new Date().toISOString(),
    };
};

export const createHealthResponse = ({ redisStatus, connectionCount, uptimeSeconds, auth = null }) => {
    const body = buildHealthPayload({ redisStatus, connectionCount, uptimeSeconds, auth });

    return {
        statusCode: body.status === "ok" ? 200 : 503,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
        },
        body,
    };
};
