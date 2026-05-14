import { randomUUID } from "node:crypto";
import http from "node:http";

import Redis from "ioredis";
import { WebSocket, WebSocketServer } from "ws";

import { authenticateSocket } from "./auth.js";
import { config } from "./config.js";
import { shouldDeliverEvent } from "./filtering.js";

const LOG_LEVEL_WEIGHT = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const activeLogLevel = LOG_LEVEL_WEIGHT[config.logLevel] ?? LOG_LEVEL_WEIGHT.info;

const log = (level, message, context = {}) => {
  const weight = LOG_LEVEL_WEIGHT[level] ?? LOG_LEVEL_WEIGHT.info;
  if (weight < activeLogLevel) {
    return;
  }

  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  process.stdout.write(`${JSON.stringify(payload)}\n`);
};

const buildRedisClient = () => {
  if (config.redisUrl) {
    return new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }

  return new Redis({
    host: config.redisHost,
    port: config.redisPort,
    password: config.redisPassword || undefined,
    db: config.redisDb,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
};

const parseQueryFromRequest = (request) => {
  const rawUrl = request.url || "/";
  const parsed = new URL(rawUrl, "http://localhost");

  return {
    token: parsed.searchParams.get("token") || null,
    companyHint: parsed.searchParams.get("company_id") || null,
    taskIds: (parsed.searchParams.get("task_ids") || "")
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value)),
  };
};

const safeSend = (socket, payload) => {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(payload));
};

const start = async () => {
  const redisSubscriber = buildRedisClient();

  redisSubscriber.on("error", (error) => {
    log("error", "Redis subscriber error.", { error: error.message });
  });

  redisSubscriber.on("reconnecting", () => {
    log("warn", "Redis subscriber reconnecting.");
  });

  const channelPattern = `${config.redisChannelPrefix}.company.*`;

  await redisSubscriber.psubscribe(channelPattern);
  log("info", "Subscribed to Redis tracking channels.", { channelPattern });

  const server = http.createServer();
  const wss = new WebSocketServer({
    server,
    maxPayload: config.maxMessageBytes,
    perMessageDeflate: false,
  });

  const connections = new Map();

  const clearAuthTimer = (socket) => {
    const state = connections.get(socket);
    if (!state?.authTimer) {
      return;
    }

    clearTimeout(state.authTimer);
    state.authTimer = null;
  };

  const authenticateAndAttach = async (socket, credentials) => {
    const state = connections.get(socket);
    if (!state) {
      return;
    }

    try {
      const identity = await authenticateSocket(credentials);
      state.authenticated = true;
      state.userId = identity.userId;
      state.userName = identity.name;
      state.companyId = identity.companyId;
      state.companyRole = identity.companyRole;
      state.accessRole = identity.accessRole;
      state.subscribedTaskIds = new Set((credentials.taskIds || []).map(Number));

      clearAuthTimer(socket);

      safeSend(socket, {
        type: "system.connected",
        connection_id: state.connectionId,
        auth_mode: identity.authMode,
        access_role: state.accessRole,
        company_id: state.companyId,
        company_role: state.companyRole,
        subscribed_task_ids: [...state.subscribedTaskIds],
      });

      log("info", "Socket authenticated.", {
        connectionId: state.connectionId,
        userId: state.userId,
        companyId: state.companyId,
        accessRole: state.accessRole,
      });
    } catch (error) {
      safeSend(socket, {
        type: "system.error",
        code: "AUTH_FAILED",
        message: error instanceof Error ? error.message : "Authentication failed.",
      });

      log("warn", "Socket authentication failed.", {
        connectionId: state.connectionId,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      socket.close(4401, "Authentication failed");
    }
  };

  wss.on("connection", (socket, request) => {
    const connectionId = randomUUID();
    const initialQuery = parseQueryFromRequest(request);

    connections.set(socket, {
      connectionId,
      authenticated: false,
      isAlive: true,
      userId: null,
      userName: null,
      companyId: null,
      companyRole: null,
      accessRole: null,
      subscribedTaskIds: new Set(),
      authTimer: setTimeout(() => {
        const state = connections.get(socket);
        if (!state?.authenticated) {
          safeSend(socket, {
            type: "system.error",
            code: "AUTH_TIMEOUT",
            message: "Authentication timeout.",
          });
          socket.close(4401, "Authentication timeout");
        }
      }, config.authTimeoutMs),
    });

    log("info", "Socket connected.", { connectionId });

    if (initialQuery.token) {
      authenticateAndAttach(socket, initialQuery).catch(() => {});
    } else {
      safeSend(socket, {
        type: "system.auth_required",
        message: "Send an authenticate message with bearer token and company_id.",
      });
    }

    socket.on("pong", () => {
      const state = connections.get(socket);
      if (state) {
        state.isAlive = true;
      }
    });

    socket.on("message", (rawBuffer) => {
      const raw = rawBuffer.toString();

      if (Buffer.byteLength(raw) > config.maxMessageBytes) {
        safeSend(socket, {
          type: "system.error",
          code: "MESSAGE_TOO_LARGE",
          message: "Message exceeds max payload size.",
        });
        return;
      }

      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        safeSend(socket, {
          type: "system.error",
          code: "INVALID_JSON",
          message: "Message must be valid JSON.",
        });
        return;
      }

      const state = connections.get(socket);
      if (!state) {
        return;
      }

      if (message?.type === "authenticate") {
        const token = message?.token;
        const companyHint = message?.company_id ?? null;
        const taskIds = Array.isArray(message?.task_ids)
          ? message.task_ids.map((value) => Number.parseInt(String(value), 10)).filter(Number.isFinite)
          : [];

        authenticateAndAttach(socket, { token, companyHint, taskIds }).catch(() => {});
        return;
      }

      if (!state.authenticated) {
        safeSend(socket, {
          type: "system.error",
          code: "AUTH_REQUIRED",
          message: "Authenticate before sending control messages.",
        });
        return;
      }

      if (message?.type === "subscribe_task") {
        const taskId = Number.parseInt(String(message?.task_id), 10);
        if (!Number.isFinite(taskId)) {
          safeSend(socket, {
            type: "system.error",
            code: "INVALID_TASK_ID",
            message: "task_id must be an integer.",
          });
          return;
        }

        state.subscribedTaskIds.add(taskId);
        safeSend(socket, {
          type: "system.subscribed_task",
          task_id: taskId,
          subscribed_task_ids: [...state.subscribedTaskIds],
        });
        return;
      }

      if (message?.type === "unsubscribe_task") {
        const taskId = Number.parseInt(String(message?.task_id), 10);
        if (!Number.isFinite(taskId)) {
          safeSend(socket, {
            type: "system.error",
            code: "INVALID_TASK_ID",
            message: "task_id must be an integer.",
          });
          return;
        }

        state.subscribedTaskIds.delete(taskId);
        safeSend(socket, {
          type: "system.unsubscribed_task",
          task_id: taskId,
          subscribed_task_ids: [...state.subscribedTaskIds],
        });
        return;
      }

      if (message?.type === "ping") {
        safeSend(socket, {
          type: "pong",
          ts: new Date().toISOString(),
        });
        return;
      }

      safeSend(socket, {
        type: "system.error",
        code: "UNKNOWN_MESSAGE_TYPE",
        message: "Unknown message type.",
      });
    });

    socket.on("close", (code, reason) => {
      const state = connections.get(socket);
      clearAuthTimer(socket);
      connections.delete(socket);

      log("info", "Socket closed.", {
        connectionId: state?.connectionId,
        code,
        reason: reason?.toString() || "",
      });
    });
  });

  redisSubscriber.on("pmessage", (_pattern, channel, message) => {
    let envelope;
    try {
      envelope = JSON.parse(message);
    } catch {
      log("warn", "Ignoring invalid Redis payload.", { channel });
      return;
    }

    if (!envelope || typeof envelope !== "object") {
      return;
    }

    const type = typeof envelope.event === "string" ? envelope.event : "tracking.unknown";

    for (const [socket, state] of connections.entries()) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      if (!shouldDeliverEvent(state, envelope)) {
        continue;
      }

      safeSend(socket, {
        type,
        channel,
        payload: envelope,
      });
    }
  });

  const heartbeat = setInterval(() => {
    for (const [socket, state] of connections.entries()) {
      if (!state.isAlive) {
        socket.terminate();
        connections.delete(socket);
        continue;
      }

      state.isAlive = false;
      socket.ping();
    }
  }, config.heartbeatIntervalMs);

  wss.on("close", () => {
    clearInterval(heartbeat);
  });

  server.listen(config.port, config.host, () => {
    log("info", "Realtime WebSocket relay started.", {
      host: config.host,
      port: config.port,
      redisChannelPrefix: config.redisChannelPrefix,
      authApiBaseUrl: config.authApiBaseUrl,
      authMePath: config.authMePath,
    });
  });
};

start().catch((error) => {
  log("error", "Fatal startup error.", {
    error: error instanceof Error ? error.message : "Unknown error",
  });
  process.exit(1);
});
