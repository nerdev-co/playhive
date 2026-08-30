"use client";

import type { ClientState, WsClientOptions, WsEnvelope, Listener } from "./types";

export class WsClient {
  private ws: WebSocket | null = null;
  private url: string;
  private state: ClientState = "closed";
  private retries = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;
  private intentionalClose = false;
  private queue: WsEnvelope[] = [];
  private listeners = new Map<string, Set<Listener<unknown>>>();
  private opts: Required<WsClientOptions>;

  constructor(opts: WsClientOptions = {}) {
    this.opts = {
      url: opts.url ?? (process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3002/ws"),
      protocols: opts.protocols ?? [],
      reconnect: opts.reconnect ?? true,
      reconnectIntervalMs: opts.reconnectIntervalMs ?? 1000,
      maxReconnectIntervalMs: opts.maxReconnectIntervalMs ?? 30000,
      reconnectDecay: opts.reconnectDecay ?? 1.5,
      maxRetries: opts.maxRetries ?? Infinity,
      queueEnabled: opts.queueEnabled ?? true,
      onOpen: opts.onOpen ?? (() => {}),
      onClose: opts.onClose ?? (() => {}),
      onError: opts.onError ?? (() => {}),
      onMessage: opts.onMessage ?? (() => {}),
    };
    this.url = this.opts.url;
  }

  getState(): ClientState {
    return this.state;
  }

  connect(): void {
    if (this.ws) {
      const readyState = this.ws.readyState;
      if (readyState === WebSocket.OPEN || readyState === WebSocket.CONNECTING) {
        return;
      }
      // Clean up stale reference (e.g. after React strict mode disconnect)
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws = null;
    }

    this.intentionalClose = false;
    this.shouldReconnect = this.opts.reconnect;
    this.state = "connecting";
    this.emit("state", this.state);

    try {
      this.ws = new WebSocket(this.url, this.opts.protocols);
    } catch (error) {
      this.state = "error";
      this.emit("state", this.state);
      this.opts.onError(error as Event);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      if (this.intentionalClose) return;
      this.state = "open";
      this.retries = 0;
      this.emit("state", this.state);
      this.opts.onOpen();
      this.flushQueue();
    };

    this.ws.onclose = (event) => {
      if (this.intentionalClose) return;
      this.state = "closed";
      this.emit("state", this.state);
      this.opts.onClose(event);
      this.ws = null;
      if (this.shouldReconnect && this.retries < this.opts.maxRetries) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (event) => {
      if (this.intentionalClose) return;
      this.state = "error";
      this.emit("state", this.state);
      this.opts.onError(event);
    };

    this.ws.onmessage = (event) => {
      if (this.intentionalClose) return;
      let data: unknown;
      try {
        data = JSON.parse(event.data);
      } catch {
        data = event.data;
      }
      this.opts.onMessage(data);
      if (data && typeof data === "object" && "type" in data) {
        this.emit((data as { type: string }).type, data);
      }
    };
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      // Remove handlers first to prevent onclose from triggering reconnect
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, "Client disconnect");
      }
      this.ws = null;
    }
    this.state = "closed";
    this.emit("state", this.state);
  }

  send(envelope: WsEnvelope): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(envelope));
    } else if (this.opts.queueEnabled) {
      this.queue.push(envelope);
    }
  }

  authenticate(token: string): void {
    this.send({
      v: 1,
      type: "AUTH",
      payload: { token },
    });
  }

  on<T = unknown>(type: string, listener: Listener<T>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener as Listener<unknown>);
    return () => this.off(type, listener);
  }

  off<T = unknown>(type: string, listener: Listener<T>): void {
    this.listeners.get(type)?.delete(listener as Listener<unknown>);
  }

  private emit(type: string, value: unknown): void {
    this.listeners.get(type)?.forEach((fn) => {
      try {
        fn(value);
      } catch (error) {
        console.error(`[ws] listener error on "${type}":`, error);
      }
    });
  }

  private flushQueue(): void {
    if (!this.opts.queueEnabled || this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    for (const envelope of batch) {
      this.send(envelope);
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    const timeout = Math.min(
      this.opts.reconnectIntervalMs * Math.pow(this.opts.reconnectDecay, this.retries),
      this.opts.maxReconnectIntervalMs,
    );
    this.retries += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), timeout);
  }
}
