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
  sessionRole: 'inbound' | 'outbound';
  authenticatedAt: string;
  lastSeenAt: string;
};

/**
 * Represents in-memory indexes for active authenticated relay sessions.
 */
export type RelaySessionRegistry = {
  inboundSessionsByPublicKey: Map<string, RelaySession>;
  outboundSessionsByPublicKey: Map<string, Map<string, RelaySession>>;
  sessionIdentityBySocketId: Map<
    string,
    {
      publicKeyBase32: string;
      sessionRole: 'inbound' | 'outbound';
    }
  >;
};

/**
 * Creates an empty relay session registry.
 */
export function createRelaySessionRegistry(): RelaySessionRegistry {
  return {
    inboundSessionsByPublicKey: new Map<string, RelaySession>(),
    outboundSessionsByPublicKey: new Map<string, Map<string, RelaySession>>(),
    sessionIdentityBySocketId: new Map(),
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
    sessionRole: 'inbound' | 'outbound';
    nowIso: string;
  },
): {
  replacedSocketId?: string;
} {
  const existingSessionIdentity = args.registry.sessionIdentityBySocketId.get(args.socket.id);
  if (existingSessionIdentity) {
    removeRelaySessionBySocketId({
      registry: args.registry,
      socketId: args.socket.id,
    });
  }

  if (args.sessionRole === 'outbound') {
    const outboundSessions = args.registry.outboundSessionsByPublicKey.get(args.publicKeyBase32)
      ?? new Map<string, RelaySession>();
    outboundSessions.set(args.socket.id, {
      publicKeyBase32: args.publicKeyBase32,
      socket: args.socket,
      sessionRole: 'outbound',
      authenticatedAt: args.nowIso,
      lastSeenAt: args.nowIso,
    });
    args.registry.outboundSessionsByPublicKey.set(args.publicKeyBase32, outboundSessions);
    args.registry.sessionIdentityBySocketId.set(args.socket.id, {
      publicKeyBase32: args.publicKeyBase32,
      sessionRole: 'outbound',
    });
    return {};
  }

  const existing = args.registry.inboundSessionsByPublicKey.get(args.publicKeyBase32);
  let replacedSocketId: string | undefined;
  if (existing && existing.socket.id !== args.socket.id) {
    replacedSocketId = existing.socket.id;
    existing.socket.close(4400, 'replaced_by_new_session');
    args.registry.sessionIdentityBySocketId.delete(existing.socket.id);
  }

  args.registry.inboundSessionsByPublicKey.set(args.publicKeyBase32, {
    publicKeyBase32: args.publicKeyBase32,
    socket: args.socket,
    sessionRole: 'inbound',
    authenticatedAt: args.nowIso,
    lastSeenAt: args.nowIso,
  });
  args.registry.sessionIdentityBySocketId.set(args.socket.id, {
    publicKeyBase32: args.publicKeyBase32,
    sessionRole: 'inbound',
  });

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
  return args.registry.inboundSessionsByPublicKey.get(args.publicKeyBase32);
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
  const identity = args.registry.sessionIdentityBySocketId.get(args.socketId);
  if (!identity) {
    return;
  }

  if (identity.sessionRole === 'outbound') {
    const outboundSessions = args.registry.outboundSessionsByPublicKey.get(identity.publicKeyBase32);
    outboundSessions?.delete(args.socketId);
    if (outboundSessions && outboundSessions.size === 0) {
      args.registry.outboundSessionsByPublicKey.delete(identity.publicKeyBase32);
    }
    args.registry.sessionIdentityBySocketId.delete(args.socketId);
    return;
  }

  const inboundSession = args.registry.inboundSessionsByPublicKey.get(identity.publicKeyBase32);
  if (inboundSession?.socket.id === args.socketId) {
    args.registry.inboundSessionsByPublicKey.delete(identity.publicKeyBase32);
  }
  args.registry.sessionIdentityBySocketId.delete(args.socketId);
}
