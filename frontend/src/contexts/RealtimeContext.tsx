import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { useAuth } from './AuthContext';

/**
 * Provides a lazily-opened Socket.IO connection bound to the logged-in user's
 * session cookie. Components consume events via the `useRealtimeEvent` hook
 * exposed below — the provider itself just manages lifecycle.
 */
interface RealtimeContextValue {
  /** True when we hold an open websocket to the backend. */
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue>({ connected: false });

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      disconnectSocket();
      setConnected(false);
      return;
    }

    const socket = connectSocket();
    setConnected(socket.connected);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [user]);

  return (
    <RealtimeContext.Provider value={{ connected }}>{children}</RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}

/**
 * Subscribe a component to a specific server event for as long as it's
 * mounted. The handler reference is captured in a ref so consumers don't have
 * to memoize it — the effect only re-subscribes when the event name changes.
 *
 * @example
 *   useRealtimeEvent('task:updated', ({ task_id, task }) => {
 *     // patch local state with the broadcast
 *   });
 */
export function useRealtimeEvent<T = unknown>(
  event: string,
  handler: (payload: T) => void,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    // `connectSocket()` is idempotent — this just grabs the live instance.
    const socket = connectSocket();
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [event]);
}
