"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { WsClient } from "./client";
import type { WsEnvelope, Listener } from "./types";

const WsContext = createContext<WsClient | null>(null);

export function WsProvider({ children, url }: { children: React.ReactNode; url?: string }) {
  const clientRef = useRef<WsClient | null>(null);
  const [state, setState] = useState<"connecting" | "open" | "closing" | "closed" | "error">("closed");

  if (!clientRef.current) {
    clientRef.current = new WsClient({
      url,
      onOpen: () => setState("open"),
      onClose: () => setState("closed"),
      onError: () => setState("error"),
      onMessage: () => {},
    });
  }

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    client.connect();
    return () => client.disconnect();
  }, []);

  return <WsContext.Provider value={clientRef.current}>{children}</WsContext.Provider>;
}

export function useWebSocket() {
  const client = useContext(WsContext);
  const [state, setState] = useState<"connecting" | "open" | "closing" | "closed" | "error">("closed");

  useEffect(() => {
    if (!client) return;
    setState(client.getState());
    const unsub = client.on("state", setState as Listener<unknown>);
    return unsub;
  }, [client]);

  const send = useCallback(
    (envelope: WsEnvelope) => {
      client?.send(envelope);
    },
    [client],
  );

  const on = useCallback(
    (type: string, listener: Listener<unknown>) => {
      return client?.on(type, listener) ?? (() => {});
    },
    [client],
  );

  return { state, send, on, client };
}
