/**
 * Enumerates relay tunnel frame types for SMTP-over-websocket streaming.
 */
export type RelayTunnelFrameType = 'smtp_start' | 'smtp_chunk' | 'smtp_end';

const RELAY_TUNNEL_VERSION = 1;
const RELAY_TUNNEL_TYPE_SMTP_START = 1;
const RELAY_TUNNEL_TYPE_SMTP_CHUNK = 2;
const RELAY_TUNNEL_TYPE_SMTP_END = 3;

/**
 * Represents shared relay tunnel frame metadata.
 */
export type RelayTunnelFrameBase = {
  streamId: string;
};

/**
 * Represents relay tunnel start frame metadata for one SMTP stream.
 */
export type RelayTunnelSmtpStartFrame = RelayTunnelFrameBase & {
  type: 'smtp_start';
  mailFrom: string;
  rcptTo: string;
  authAttestation?: {
    keyId: string;
    payloadBase64: string;
    signatureBase64: string;
  };
};

/**
 * Represents relay tunnel chunk frame for one SMTP stream payload fragment.
 */
export type RelayTunnelSmtpChunkFrame = RelayTunnelFrameBase & {
  type: 'smtp_chunk';
  chunk: Buffer;
};

/**
 * Represents relay tunnel end frame for one SMTP stream completion marker.
 */
export type RelayTunnelSmtpEndFrame = RelayTunnelFrameBase & {
  type: 'smtp_end';
};

/**
 * Represents any supported parsed relay tunnel frame.
 */
export type RelayTunnelFrame =
  | RelayTunnelSmtpStartFrame
  | RelayTunnelSmtpChunkFrame
  | RelayTunnelSmtpEndFrame;

/**
 * Encodes one relay tunnel frame into binary wire format.
 */
export function encodeRelayTunnelFrame(
  args: {
    frame: RelayTunnelFrame;
  },
): Buffer {
  const streamIdBytes = Buffer.from(args.frame.streamId, 'utf8');
  const typeCode = relayTunnelTypeToCode({
    type: args.frame.type,
  });
  const body = relayTunnelFrameBody({
    frame: args.frame,
  });

  const header = Buffer.alloc(1 + 1 + 1 + 4);
  header.writeUInt8(RELAY_TUNNEL_VERSION, 0);
  header.writeUInt8(typeCode, 1);
  header.writeUInt8(streamIdBytes.length, 2);
  header.writeUInt32BE(body.length, 3);

  return Buffer.concat([header, streamIdBytes, body]);
}

/**
 * Parses one relay tunnel binary frame payload into a typed frame object.
 */
export function parseRelayTunnelFrame(
  args: {
    payload: Buffer;
  },
): RelayTunnelFrame | undefined {
  if (args.payload.length < 7) {
    return undefined;
  }

  const version = args.payload.readUInt8(0);
  if (version !== RELAY_TUNNEL_VERSION) {
    return undefined;
  }

  const typeCode = args.payload.readUInt8(1);
  const streamIdLength = args.payload.readUInt8(2);
  const bodyLength = args.payload.readUInt32BE(3);
  const minLength = 7 + streamIdLength + bodyLength;
  if (args.payload.length !== minLength) {
    return undefined;
  }

  const streamIdOffset = 7;
  const streamId = args.payload.subarray(
    streamIdOffset,
    streamIdOffset + streamIdLength,
  ).toString('utf8');
  const bodyOffset = streamIdOffset + streamIdLength;
  const body = args.payload.subarray(bodyOffset, bodyOffset + bodyLength);

  if (typeCode === RELAY_TUNNEL_TYPE_SMTP_START) {
    try {
      const parsed = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
      if (typeof parsed.mailFrom !== 'string' || typeof parsed.rcptTo !== 'string') {
        return undefined;
      }

      const authAttestationRecord = isRelayAuthAttestationRecord({
        value: parsed.authAttestation,
      })
        ? parsed.authAttestation as {
          keyId: string;
          payloadBase64: string;
          signatureBase64: string;
        }
        : undefined;

      return {
        type: 'smtp_start',
        streamId,
        mailFrom: parsed.mailFrom,
        rcptTo: parsed.rcptTo,
        authAttestation: authAttestationRecord
          ? {
            keyId: authAttestationRecord.keyId,
            payloadBase64: authAttestationRecord.payloadBase64,
            signatureBase64: authAttestationRecord.signatureBase64,
          }
          : undefined,
      };
    } catch {
      return undefined;
    }
  }

  if (typeCode === RELAY_TUNNEL_TYPE_SMTP_CHUNK) {
    return {
      type: 'smtp_chunk',
      streamId,
      chunk: body,
    };
  }

  if (typeCode === RELAY_TUNNEL_TYPE_SMTP_END) {
    return {
      type: 'smtp_end',
      streamId,
    };
  }

  return undefined;
}

/**
 * Encodes one SMTP start frame for inbound relay-to-client stream delivery.
 */
export function createRelaySmtpStartFrame(
  args: {
    streamId: string;
    mailFrom: string;
    rcptTo: string;
    authAttestation?: {
      keyId: string;
      payloadBase64: string;
      signatureBase64: string;
    };
  },
): Buffer {
  return encodeRelayTunnelFrame({
    frame: {
      type: 'smtp_start',
      streamId: args.streamId,
      mailFrom: args.mailFrom,
      rcptTo: args.rcptTo,
      authAttestation: args.authAttestation,
    },
  });
}

/**
 * Encodes one SMTP chunk frame for inbound relay-to-client stream delivery.
 */
export function createRelaySmtpChunkFrame(
  args: {
    streamId: string;
    chunk: Buffer;
  },
): Buffer {
  return encodeRelayTunnelFrame({
    frame: {
      type: 'smtp_chunk',
      streamId: args.streamId,
      chunk: args.chunk,
    },
  });
}

/**
 * Encodes one SMTP end frame for inbound relay-to-client stream completion.
 */
export function createRelaySmtpEndFrame(
  args: {
    streamId: string;
  },
): Buffer {
  return encodeRelayTunnelFrame({
    frame: {
      type: 'smtp_end',
      streamId: args.streamId,
    },
  });
}

/**
 * Converts tunnel frame type into wire-level type code.
 */
function relayTunnelTypeToCode(
  args: {
    type: RelayTunnelFrameType;
  },
): number {
  if (args.type === 'smtp_start') {
    return RELAY_TUNNEL_TYPE_SMTP_START;
  }
  if (args.type === 'smtp_chunk') {
    return RELAY_TUNNEL_TYPE_SMTP_CHUNK;
  }

  return RELAY_TUNNEL_TYPE_SMTP_END;
}

/**
 * Resolves wire body bytes for one typed relay tunnel frame.
 */
function relayTunnelFrameBody(
  args: {
    frame: RelayTunnelFrame;
  },
): Buffer {
  if (args.frame.type === 'smtp_start') {
    return Buffer.from(JSON.stringify({
      mailFrom: args.frame.mailFrom,
      rcptTo: args.frame.rcptTo,
      authAttestation: args.frame.authAttestation,
    }), 'utf8');
  }
  if (args.frame.type === 'smtp_chunk') {
    return args.frame.chunk;
  }

  return Buffer.alloc(0);
}

/**
 * Returns true when one value matches relay auth attestation object shape.
 */
export function isRelayAuthAttestationRecord(
  args: {
    value: unknown;
  },
): boolean {
  if (typeof args.value !== 'object' || args.value === null || Array.isArray(args.value)) {
    return false;
  }
  const record = args.value as Record<string, unknown>;
  return typeof record.keyId === 'string'
    && record.keyId.trim().length > 0
    && typeof record.payloadBase64 === 'string'
    && record.payloadBase64.trim().length > 0
    && typeof record.signatureBase64 === 'string'
    && record.signatureBase64.trim().length > 0;
}
