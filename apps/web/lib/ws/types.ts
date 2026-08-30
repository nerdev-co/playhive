export type ClientState = "connecting" | "open" | "closing" | "closed" | "error";

export interface WsClientOptions {
  url?: string;
  protocols?: string | string[];
  reconnect?: boolean;
  reconnectIntervalMs?: number;
  maxReconnectIntervalMs?: number;
  reconnectDecay?: number;
  maxRetries?: number;
  queueEnabled?: boolean;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onMessage?: (data: unknown) => void;
}

export type WsEnvelope = {
  v: number;
  type: string;
  requestId?: string;
  roomId?: string;
  payload: unknown;
};

export type Listener<T = unknown> = (value: T) => void;
