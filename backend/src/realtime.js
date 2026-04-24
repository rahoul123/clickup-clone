import { Server as SocketIOServer } from 'socket.io';

/**
 * Build the real-time layer (Socket.IO) on top of the existing HTTP server.
 *
 * Design notes:
 *   - We piggy-back on the existing express-session cookie: the socket.io
 *     handshake runs the session middleware, so every connected socket has
 *     access to `socket.request.session.userId` — same trust as any REST call.
 *   - Every authenticated socket joins two rooms:
 *       `workspace:global`   — fan-out of task/comment/list events (broad).
 *       `user:<userId>`      — personal channel for notifications etc.
 *   - The exported helpers (`broadcast`, `toUser`) are the ONLY way route
 *     handlers should push events. That keeps the emit contract small and
 *     makes it trivial to audit what the server sends to clients.
 */
export function createRealtime(httpServer, { sessionMiddleware, corsOrigin }) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Same policy as the REST CORS layer: allow any localhost port +
        // the explicit CLIENT_ORIGIN + same-origin (no Origin header).
        if (!origin) return callback(null, true);
        if (origin === corsOrigin) return callback(null, true);
        if (/^http:\/\/localhost:\d+$/.test(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} not allowed`));
      },
      credentials: true,
    },
    // Sensible pingInterval keeps idle sockets alive through corporate
    // proxies without being too chatty.
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  // Re-use the express-session middleware so socket.request.session is
  // populated from the `collab.sid` cookie.
  io.engine.use((req, res, next) => sessionMiddleware(req, res, next));

  io.use((socket, next) => {
    const session = socket.request.session;
    const userId = session?.userId;
    if (!userId) return next(new Error('Unauthorized'));
    socket.data.userId = String(userId);
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    socket.join('workspace:global');
    socket.join(`user:${userId}`);

    socket.emit('hello', { userId, at: new Date().toISOString() });
  });

  /** Fan-out to every authenticated socket (task/comment/list events). */
  function broadcast(event, payload) {
    io.to('workspace:global').emit(event, payload);
  }

  /** Targeted emit to a single user's sockets (notifications, DM-style). */
  function toUser(userId, event, payload) {
    if (!userId) return;
    io.to(`user:${String(userId)}`).emit(event, payload);
  }

  /** Emit to many users in one go (useful for task assignee fan-out). */
  function toUsers(userIds, event, payload) {
    const unique = [...new Set((userIds || []).filter(Boolean).map(String))];
    if (!unique.length) return;
    io.to(unique.map((id) => `user:${id}`)).emit(event, payload);
  }

  return { io, broadcast, toUser, toUsers };
}
