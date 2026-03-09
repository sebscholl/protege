/**
 * Represents captured outbound control and close behavior for relay auth socket doubles.
 */
export type RelayAuthSocketCapture = {
  sentMessages: string[];
  closeCode: number;
  closeReason: string;
};

/**
 * Creates one relay auth socket test double with captured send and close behavior.
 */
export function createRelayAuthSocketDouble(
  args: {
    socketId: string;
  },
): {
  socket: {
    id: string;
    send: (payload: string) => void;
    close: (
      code: number,
      reason: string,
    ) => void;
  };
  capture: RelayAuthSocketCapture;
} {
  const capture: RelayAuthSocketCapture = {
    sentMessages: [],
    closeCode: -1,
    closeReason: '',
  };
  return {
    socket: {
      id: args.socketId,
      send: (payload: string): void => {
        capture.sentMessages.push(payload);
      },
      close: (
        code: number,
        reason: string,
      ): void => {
        capture.closeCode = code;
        capture.closeReason = reason;
      },
    },
    capture,
  };
}

/**
 * Represents captured ws-level behavior for websocket connection test doubles.
 */
export type RelayWsSocketState = {
  sent: Array<string | Buffer>;
  closedCode: number;
  closedReason: string;
  emitMessage: (payload: unknown) => void;
  emitClose: () => void;
};

/**
 * Creates one websocket-like test double with controllable event emission.
 */
export function createRelayWsSocketDouble(): RelayWsSocketState & {
  ws: {
    send: (payload: string | Buffer) => void;
    close: (
      code: number,
      reason: string,
    ) => void;
    on: (
      event: 'message' | 'close',
      listener: (payload?: unknown) => void,
    ) => void;
  };
} {
  const listeners: Record<string, ((payload?: unknown) => void)[]> = {
    message: [],
    close: [],
  };
  const state = {
    sent: [] as Array<string | Buffer>,
    closedCode: -1,
    closedReason: '',
  };

  return {
    get sent(): Array<string | Buffer> {
      return state.sent;
    },
    get closedCode(): number {
      return state.closedCode;
    },
    get closedReason(): string {
      return state.closedReason;
    },
    ws: {
      send: (payload: string | Buffer): void => {
        state.sent.push(payload);
      },
      close: (
        code: number,
        reason: string,
      ): void => {
        state.closedCode = code;
        state.closedReason = reason;
      },
      on: (
        event: 'message' | 'close',
        listener: (payload?: unknown) => void,
      ): void => {
        listeners[event].push(listener);
      },
    },
    emitMessage: (payload: unknown): void => {
      for (const listener of listeners.message) {
        listener(payload);
      }
    },
    emitClose: (): void => {
      for (const listener of listeners.close) {
        listener();
      }
    },
  };
}
