import { randomUUID } from "node:crypto";
import http from "node:http";

import Redis from "ioredis";
import { WebSocket, WebSocketServer } from "ws";

import { authenticateSocket, SocketAuthError } from "./auth.js";
import { config } from "./config.js";
import { shouldDeliverEvent } from "./filtering.js";
import { createHealthResponse } from "./health.js";

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

  const connections = new Map();
  const server = http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      const health = createHealthResponse({
        redisStatus: redisSubscriber.status,
        connectionCount: connections.size,
        uptimeSeconds: Math.round(process.uptime()),
      });

      response.writeHead(health.statusCode, health.headers);
      response.end(JSON.stringify(health.body));
      return;
    }

    response.writeHead(404, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify({ error: "Not found" }));
  });
  const wss = new WebSocketServer({
    server,
    maxPayload: config.maxMessageBytes,
    perMessageDeflate: false,
  });

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
      if (!connections.has(socket)) {
        return;
      }
      state.authenticated = true;
      state.token = credentials.token;
      state.companyHint = String(identity.companyId);
      state.userId = identity.userId;
      state.userName = identity.name;
      state.companyId = identity.companyId;
      state.companyRole = identity.companyRole;
      state.accessRole = identity.accessRole;
      state.scope = identity.scope;
      state.visibleUserIds = identity.visibleUserIds;
      // Only tasks the API confirmed this user may follow.
      state.subscribedTaskIds = new Set(identity.allowedTaskIds);
      state.lastScopeRefreshAt = Date.now();

      const rejectedTaskIds = (credentials.taskIds || []).filter((id) => !state.subscribedTaskIds.has(Number(id)));
      if (rejectedTaskIds.length) {
        log("warn", "Dropped unauthorized task subscriptions.", {
          connectionId: state.connectionId,
          userId: state.userId,
          companyId: state.companyId,
          taskIds: rejectedTaskIds,
        });
      }

      clearAuthTimer(socket);

      safeSend(socket, {
        type: "system.connected",
        connection_id: state.connectionId,
        auth_mode: identity.authMode,
        access_role: state.accessRole,
        company_id: state.companyId,
        company_role: state.companyRole,
        scope: state.scope,
        subscribed_task_ids: [...state.subscribedTaskIds],
      });

      log("info", "Socket authenticated.", {
        connectionId: state.connectionId,
        userId: state.userId,
        companyId: state.companyId,
        accessRole: state.accessRole,
        scope: state.scope,
        visibleUserCount: state.visibleUserIds ? state.visibleUserIds.size : "all",
      });
    } catch (error) {
      const permanent = error instanceof SocketAuthError ? error.permanent : false;

      safeSend(socket, {
        type: "system.error",
        code: "AUTH_FAILED",
        // Clients should stop reconnecting when retryable is false.
        retryable: !permanent,
        message: error instanceof Error ? error.message : "Authentication failed.",
      });

      log("warn", "Socket authentication failed.", {
        connectionId: state.connectionId,
        companyHint: credentials.companyHint ?? null,
        status: error instanceof SocketAuthError ? error.status : null,
        permanent,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      // 4403 = permanent (do not retry), 4401 = transient.
      socket.close(permanent ? 4403 : 4401, "Authentication failed");
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
      scope: null,
      visibleUserIds: null,
      token: null,
      companyHint: null,
      lastScopeRefreshAt: 0,
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
      // Deprecated: tokens in URLs end up in proxy access logs.
      log("warn", "Socket used deprecated query-string token.", { connectionId });
      authenticateAndAttach(socket, initialQuery).catch(() => { });
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

        authenticateAndAttach(socket, { token, companyHint, taskIds }).catch(() => { });
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

        if (state.subscribedTaskIds.has(taskId) || state.scope === "company") {
          state.subscribedTaskIds.add(taskId);
          safeSend(socket, {
            type: "system.subscribed_task",
            task_id: taskId,
            subscribed_task_ids: [...state.subscribedTaskIds],
          });
          return;
        }

        authenticateSocket({ token: state.token, companyHint: state.companyHint, taskIds: [taskId] })
          .then((identity) => {
            if (!connections.has(socket)) {
              return;
            }
            if (!identity.allowedTaskIds.has(taskId)) {
              log("warn", "Rejected unauthorized task subscription.", {
                connectionId: state.connectionId,
                userId: state.userId,
                companyId: state.companyId,
                taskId,
              });
              safeSend(socket, {
                type: "system.error",
                code: "TASK_FORBIDDEN",
                task_id: taskId,
                message: "You are not allowed to follow this task.",
              });
              return;
            }
            state.subscribedTaskIds.add(taskId);
            safeSend(socket, {
              type: "system.subscribed_task",
              task_id: taskId,
              subscribed_task_ids: [...state.subscribedTaskIds],
            });
          })
          .catch((error) => {
            safeSend(socket, {
              type: "system.error",
              code: "TASK_SUBSCRIBE_FAILED",
              task_id: taskId,
              message: error instanceof Error ? error.message : "Could not verify task access.",
            });
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

  // Re-check non-company scopes so supervisor reassignments, removed
  // memberships and revoked tokens take effect without a reconnect.
  const refreshScopes = async () => {
    const now = Date.now();
    for (const [socket, state] of connections.entries()) {
      if (!state.authenticated || state.scope === "company" || !state.token) {
        continue;
      }
      if (now - state.lastScopeRefreshAt < config.scopeRefreshMs) {
        continue;
      }
      state.lastScopeRefreshAt = now;

      try {
        const identity = await authenticateSocket({
          token: state.token,
          companyHint: state.companyHint,
          taskIds: [...state.subscribedTaskIds],
        });
        state.scope = identity.scope;
        state.accessRole = identity.accessRole;
        state.visibleUserIds = identity.visibleUserIds;
        state.subscribedTaskIds = new Set(identity.allowedTaskIds);
      } catch (error) {
        if (error instanceof SocketAuthError && error.permanent) {
          log("warn", "Closing socket after failed scope refresh.", {
            connectionId: state.connectionId,
            userId: state.userId,
            status: error.status,
          });
          safeSend(socket, {
            type: "system.error",
            code: "AUTH_REVOKED",
            retryable: false,
            message: error.message,
          });
          socket.close(4403, "Authorization revoked");
        }
        // Transient errors: keep the last known scope and try again next tick.
      }
    }
  };

  const scopeRefresher = setInterval(() => {
    refreshScopes().catch(() => { });
  }, Math.max(15000, Math.min(config.scopeRefreshMs, 60000)));

  wss.on("close", () => {
    clearInterval(heartbeat);
    clearInterval(scopeRefresher);
  });

  server.listen(config.port, config.host, () => {
    log("info", "Realtime WebSocket relay started.", {
      host: config.host,
      port: config.port,
      redisChannelPrefix: config.redisChannelPrefix,
      authApiBaseUrl: config.authApiBaseUrl,
      authorizePath: config.authorizePath,
    });
  });
};

start().catch((error) => {
  log("error", "Fatal startup error.", {
    error: error instanceof Error ? error.message : "Unknown error",
  });
  process.exit(1);
});
