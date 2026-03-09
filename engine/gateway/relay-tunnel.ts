import type { RelayTunnelFrame } from '@relay/src/tunnel';

/**
 * Represents one in-flight relay SMTP stream assembled from tunnel frames.
 */
export type RelayTunnelInflightStream = {
  streamId: string;
  mailFrom: string;
  rcptTo: string;
  authAttestation?: {
    keyId: string;
    payloadBase64: string;
    signatureBase64: string;
  };
  chunkBuffers: Buffer[];
};

/**
 * Represents in-memory relay tunnel frame assembly state.
 */
export type RelayTunnelAssemblyState = {
  inflightByStreamId: Map<string, RelayTunnelInflightStream>;
};

/**
 * Creates one empty relay tunnel assembly state container.
 */
export function createRelayTunnelAssemblyState(): RelayTunnelAssemblyState {
  return {
    inflightByStreamId: new Map<string, RelayTunnelInflightStream>(),
  };
}

/**
 * Applies one relay tunnel frame to assembly state and emits completed MIME buffers on end.
 */
export function applyRelayTunnelFrame(
  args: {
    state: RelayTunnelAssemblyState;
    frame: RelayTunnelFrame;
    onCompleted: (
      args: {
        streamId: string;
        mailFrom: string;
        rcptTo: string;
        authAttestation?: {
          keyId: string;
          payloadBase64: string;
          signatureBase64: string;
        };
        rawMimeBuffer: Buffer;
      },
    ) => void;
  },
): void {
  if (args.frame.type === 'smtp_start') {
    args.state.inflightByStreamId.set(args.frame.streamId, {
      streamId: args.frame.streamId,
      mailFrom: args.frame.mailFrom,
      rcptTo: args.frame.rcptTo,
      authAttestation: args.frame.authAttestation,
      chunkBuffers: [],
    });
    return;
  }

  if (args.frame.type === 'smtp_chunk') {
    const inflight = args.state.inflightByStreamId.get(args.frame.streamId);
    if (!inflight) {
      return;
    }

    inflight.chunkBuffers.push(args.frame.chunk);
    return;
  }

  const inflight = args.state.inflightByStreamId.get(args.frame.streamId);
  if (!inflight) {
    return;
  }

  args.state.inflightByStreamId.delete(args.frame.streamId);
  args.onCompleted({
    streamId: inflight.streamId,
    mailFrom: inflight.mailFrom,
    rcptTo: inflight.rcptTo,
    authAttestation: inflight.authAttestation,
    rawMimeBuffer: Buffer.concat(inflight.chunkBuffers),
  });
}
