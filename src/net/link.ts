// The connection to a relay (src/../server/relay-core.cjs): one WebSocket,
// JSON messages, and automatic reconnection into the same seat after a drop.

export interface RelayMsg {
  t: string;
  [k: string]: unknown;
}

/** What the relay calls each message from another player. */
export interface FromMsg {
  t: 'from';
  peer: number;
  d: unknown;
}

/** A server address as typed ("192.168.1.20", "myhost:8080", "wss://example.com") → a WebSocket URL. */
export function serverUrl(input: string, defaultPort = 7777): string {
  let s = input.trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) s = s.replace(/^http/i, 'ws');
  if (!/^wss?:\/\//i.test(s)) {
    // No scheme: plain ws, unless this page itself is https (browsers only allow wss then).
    const secure = typeof location !== 'undefined' && location.protocol === 'https:';
    s = `${secure ? 'wss' : 'ws'}://${s}`;
  }
  try {
    const u = new URL(s);
    if (!u.port && !/^wss:/i.test(s) && !input.includes(':')) u.port = String(defaultPort);
    return u.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

type Handler = (m: RelayMsg) => void;

/**
 * A live connection to a relay. `seat()` is called on every (re)connect to
 * send the host/join message that claims the seat; messages sent while
 * reconnecting are dropped (the game's next snapshot or input replaces them).
 */
export class RelayLink {
  readonly url: string;
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private closedByUs = false;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pingN = 0;
  private pingAt = new Map<number, number>();
  /** Round-trip time to the relay, in ms (smoothed). */
  rtt = 0;
  /** Connected right now. */
  online = false;
  /** Called on every (re)connection to claim the seat. */
  seat: (() => RelayMsg) | null = null;
  /** Lost the connection and gave up (or never got it). */
  onDown: ((reason: string) => void) | null = null;
  /** Reconnecting after a drop (true) or back (false). */
  onRetry: ((retrying: boolean) => void) | null = null;
  bytesIn = 0;
  bytesOut = 0;

  constructor(url: string) {
    this.url = url;
  }

  /** Connects; resolves on the first open, rejects if that fails. */
  connect(timeoutMs = 6000): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.ws?.close();
        reject(new Error('No answer from that address.'));
      }, timeoutMs);
      this.open(
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        },
        (why) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(new Error(why));
        },
      );
    });
  }

  private open(onOpen?: () => void, onFail?: (why: string) => void): void {
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      onFail?.(err instanceof Error ? err.message : 'Bad address.');
      return;
    }
    this.ws = ws;
    let opened = false;
    ws.onopen = () => {
      opened = true;
      this.online = true;
      this.retry = 0;
      const seat = this.seat?.();
      if (seat) this.send(seat);
      this.startPing();
      onOpen?.();
    };
    ws.onmessage = (e) => {
      const text = typeof e.data === 'string' ? e.data : '';
      this.bytesIn += text.length;
      let m: RelayMsg;
      try {
        m = JSON.parse(text);
      } catch {
        return;
      }
      if (m.t === 'pong') {
        const at = this.pingAt.get(m.n as number);
        if (at !== undefined) {
          const rtt = performance.now() - at;
          this.rtt = this.rtt ? this.rtt * 0.8 + rtt * 0.2 : rtt;
          this.pingAt.delete(m.n as number);
        }
        return;
      }
      for (const fn of [...(this.handlers.get(m.t) ?? []), ...(this.handlers.get('*') ?? [])]) fn(m);
    };
    ws.onclose = () => {
      this.online = false;
      this.stopPing();
      if (this.ws !== ws) return;
      this.ws = null;
      if (!opened) {
        if (onFail) onFail('Could not connect to that address.');
        else this.reconnect();
        return;
      }
      if (this.closedByUs) return;
      this.reconnect();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  /** After a drop: try again with growing pauses for about a minute and a half, then give up. */
  private reconnect(): void {
    if (this.closedByUs) return;
    if (this.retry >= 12) {
      this.onDown?.('Lost the connection.');
      return;
    }
    this.onRetry?.(true);
    const wait = Math.min(8000, 500 * 2 ** this.retry);
    this.retry++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open(() => this.onRetry?.(false));
    }, wait);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      const n = ++this.pingN;
      this.pingAt.set(n, performance.now());
      if (this.pingAt.size > 20) this.pingAt.delete(this.pingAt.keys().next().value as number);
      this.send({ t: 'ping', n });
    }, 2000);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  on(type: string, fn: Handler): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  /** Waits for the next message of `type` (or an error message), with a timeout. */
  once(type: string, timeoutMs = 6000): Promise<RelayMsg> {
    return new Promise((resolve, reject) => {
      const offs: (() => void)[] = [];
      const done = () => {
        clearTimeout(timer);
        offs.forEach((f) => f());
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error('The server did not answer.'));
      }, timeoutMs);
      offs.push(
        this.on(type, (m) => {
          done();
          resolve(m);
        }),
        this.on('error', (m) => {
          done();
          reject(new Error(String(m.text ?? 'The server refused.')));
        }),
      );
    });
  }

  send(m: RelayMsg): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const text = JSON.stringify(m);
    this.bytesOut += text.length;
    ws.send(text);
  }

  /** Bytes queued but not yet sent (a slow connection backs up here). */
  get backlog(): number {
    return this.ws?.bufferedAmount ?? 0;
  }

  close(): void {
    this.closedByUs = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.stopPing();
    this.online = false;
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {
      /* already closed */
    }
  }
}
