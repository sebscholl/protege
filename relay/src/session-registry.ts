/**
 * Represents one minimal websocket-like relay socket contract.
 */
export type RelaySocket = {
  id: string;
  send(payload: string | Buffer): void;
  close(code: number, reason: string): void;
};

/**
 * Represents one active authenticated relay socket session.
 */
export type RelaySession = {
  publicKeyBase32: string;
  socket: RelaySocket;
  authenticatedAt: string;
  lastSeenAt: string;
};

/**
 * Represents in-memory indexes for active authenticated relay sessions.
 */
export type RelaySessionRegistry = {
  sessionsByPublicKey: Map<string, RelaySession>;
  publicKeyBySocketId: Map<string, string>;
};

/**
 * Creates an empty relay session registry.
 */
export function createRelaySessionRegistry(): RelaySessionRegistry {
  return {
    sessionsByPublicKey: new Map<string, RelaySession>(),
    publicKeyBySocketId: new Map<string, string>(),
  };
}

/**
 * Activates one session for one public key, replacing any existing session.
 */
export function activateRelaySession(
  args: {
    registry: RelaySessionRegistry;
    publicKeyBase32: string;
    socket: RelaySocket;
    nowIso: string;
  },
): {
  replacedSocketId?: string;
} {
  const existing = args.registry.sessionsByPublicKey.get(args.publicKeyBase32);
  let replacedSocketId: string | undefined;
  if (existing && existing.socket.id !== args.socket.id) {
    replacedSocketId = existing.socket.id;
    existing.socket.close(4400, 'replaced_by_new_session');
    args.registry.publicKeyBySocketId.delete(existing.socket.id);
  }

  const existingForSocket = args.registry.publicKeyBySocketId.get(args.socket.id);
  if (existingForSocket && existingForSocket !== args.publicKeyBase32) {
    args.registry.sessionsByPublicKey.delete(existingForSocket);
  }

  args.registry.sessionsByPublicKey.set(args.publicKeyBase32, {
    publicKeyBase32: args.publicKeyBase32,
    socket: args.socket,
    authenticatedAt: args.nowIso,
    lastSeenAt: args.nowIso,
  });
  args.registry.publicKeyBySocketId.set(args.socket.id, args.publicKeyBase32);

  return {
    replacedSocketId,
  };
}

/**
 * Returns one active relay session by public key identity.
 */
export function readRelaySessionByPublicKey(
  args: {
    registry: RelaySessionRegistry;
    publicKeyBase32: string;
  },
): RelaySession | undefined {
  return args.registry.sessionsByPublicKey.get(args.publicKeyBase32);
}

/**
 * Removes one relay session by socket id and clears reverse index entries.
 */
export function removeRelaySessionBySocketId(
  args: {
    registry: RelaySessionRegistry;
    socketId: string;
  },
): void {
  const publicKey = args.registry.publicKeyBySocketId.get(args.socketId);
  if (!publicKey) {
    return;
  }

  const session = args.registry.sessionsByPublicKey.get(publicKey);
  if (session?.socket.id === args.socketId) {
    args.registry.sessionsByPublicKey.delete(publicKey);
  }
  args.registry.publicKeyBySocketId.delete(args.socketId);
}
