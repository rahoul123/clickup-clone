import { io, type Socket } from 'socket.io-client';

/**
 * A single Socket.IO connection, lazily created the first time a caller asks
 * for it. The connection is kept alive for the lifetime of the tab and reused
 * by every component (via `useRealtimeEvent`).
 *
 * We purposely don't auto-connect on import: sockets require a valid session
 * cookie, so we wait for the auth layer (`RealtimeProvider`) to call
 * `connectSocket()` after login.
 */
let socketInstance: Socket | null = null;

function resolveEndpoint(): string | undefined {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!base) return undefined;
  // Strip the trailing `/api` so socket.io hits the server root where the
  // websocket endpoint lives (default `/socket.io/`). For relative bases
  // like `/api`, we just return `/` so the client uses same-origin.
  if (base.startsWith('http')) {
    return base.replace(/\/api\/?$/, '');
  }
  return '/';
}

export function connectSocket(): Socket {
  if (socketInstance && socketInstance.connected) return socketInstance;
  if (socketInstance) {
    socketInstance.connect();
    return socketInstance;
  }

  const endpoint = resolveEndpoint();
  socketInstance = io(endpoint, {
    // Cookies carry the express-session id so the server can identify us.
    withCredentials: true,
    // Websockets by default, long-poll fallback for picky networks.
    transports: ['websocket', 'polling'],
    // Small reconnect backoff so flaky Wi-Fi doesn't hammer the server.
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  });

  if (import.meta.env.DEV) {
    socketInstance.on('connect', () => {
      console.log('[socket] connected', socketInstance?.id);
    });
    socketInstance.on('disconnect', (reason) => {
      console.log('[socket] disconnected', reason);
    });
    socketInstance.on('connect_error', (err) => {
      console.warn('[socket] connect_error', err.message);
    });
  }
  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.removeAllListeners();
    socketInstance.disconnect();
    socketInstance = null;
  }
}

export function getSocket(): Socket | null {
  return socketInstance;
}
