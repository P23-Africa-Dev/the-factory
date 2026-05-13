const parseInteger = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
};

export const config = {
  host: process.env.TRACKING_WS_HOST || "0.0.0.0",
  port: parseInteger(process.env.TRACKING_WS_PORT, 8081),
  maxMessageBytes: parseInteger(process.env.TRACKING_WS_MAX_MESSAGE_BYTES, 32 * 1024),
  heartbeatIntervalMs: parseInteger(process.env.TRACKING_WS_HEARTBEAT_MS, 30000),
  authTimeoutMs: parseInteger(process.env.TRACKING_WS_AUTH_TIMEOUT_MS, 10000),
  authApiBaseUrl: (process.env.TRACKING_WS_AUTH_API_BASE_URL || "http://nginx").replace(/\/$/, ""),
  authMePath: process.env.TRACKING_WS_AUTH_ME_PATH || "/api/v1/user/me",
  logLevel: process.env.TRACKING_WS_LOG_LEVEL || "info",
  allowInsecureSkipAuth: parseBoolean(process.env.TRACKING_WS_ALLOW_INSECURE_SKIP_AUTH, false),
  redisUrl: process.env.TRACKING_WS_REDIS_URL || "",
  redisHost: process.env.TRACKING_WS_REDIS_HOST || process.env.REDIS_HOST || "redis",
  redisPort: parseInteger(process.env.TRACKING_WS_REDIS_PORT || process.env.REDIS_PORT, 6379),
  redisPassword: process.env.TRACKING_WS_REDIS_PASSWORD || process.env.REDIS_PASSWORD || "",
  redisDb: parseInteger(process.env.TRACKING_WS_REDIS_DB, 0),
  redisChannelPrefix:
    process.env.TASK_TRACKING_REDIS_CHANNEL_PREFIX ||
    process.env.TRACKING_WS_REDIS_CHANNEL_PREFIX ||
    "factory23.tracking",
};
