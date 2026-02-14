import { pathToFileURL } from 'node:url';

import { parseRelayTunnelFrame } from '@relay/src/tunnel';
import { buildRelayPublicKeyBase32, relayWsMessageDataToText } from '@relay/scripts/manual-ws-auth-test';
import { readPositiveIntOrFallback } from '@relay/scripts/number';

import { generateKeyPairSync, sign } from 'node:crypto';

/**
 * Represents one manual relay websocket inbox listener config.
 */
export type RelayWsInboxConfig = {
  url: string;
  listenMs: number;
};

/**
 * Resolves manual relay websocket inbox config from CLI args.
 */
export function resolveRelayWsInboxConfig(
  args: {
    argv: string[];
  },
): RelayWsInboxConfig {
  const url = args.argv[2] ?? 'ws://127.0.0.1:8080/ws';
  return {
    url,
    listenMs: readPositiveIntOrFallback({
      raw: args.argv[3],
      fallback: 30000,
    }),
  };
}

/**
 * Runs one manual authenticated websocket inbox listener and logs tunnel frames.
 */
export async function runRelayWsInboxListener(
  args: {
    config: RelayWsInboxConfig;
    writeLine: (line: string) => void;
  },
): Promise<void> {
  if (typeof WebSocket === 'undefined') {
    throw new Error('Global WebSocket is unavailable in this Node runtime.');
  }

  const keyPair = generateKeyPairSync('ed25519');
  const publicKeyBase32 = buildRelayPublicKeyBase32({
    publicKey: keyPair.publicKey,
  });
  args.writeLine(`CONNECT ${args.config.url}`);
  args.writeLine(`PUBLIC_KEY ${publicKeyBase32}`);
  args.writeLine(`RECIPIENT ${publicKeyBase32}@relay-protege-mail.com`);

  await new Promise<void>((resolve, reject): void => {
    const socket = new WebSocket(args.config.url);
    const stopTimer = setTimeout((): void => {
      args.writeLine('LISTEN COMPLETE');
      socket.close();
      resolve();
    }, args.config.listenMs);

    socket.onopen = (): void => {
      socket.send(JSON.stringify({
        type: 'auth_challenge_request',
        publicKeyBase32,
      }));
      args.writeLine('SENT auth_challenge_request');
    };

    socket.onmessage = async (event: MessageEvent): Promise<void> => {
      try {
        const binaryPayload = await relayWsMessageDataToBuffer({
          data: event.data,
        });
        if (binaryPayload) {
          const frame = parseRelayTunnelFrame({
            payload: binaryPayload,
          });
          if (frame) {
            if (frame.type === 'smtp_start') {
              args.writeLine(`RECV smtp_start streamId=${frame.streamId} from=${frame.mailFrom} to=${frame.rcptTo}`);
              return;
            }
            if (frame.type === 'smtp_chunk') {
              args.writeLine(`RECV smtp_chunk streamId=${frame.streamId} bytes=${frame.chunk.length}`);
              return;
            }

            args.writeLine(`RECV smtp_end streamId=${frame.streamId}`);
            return;
          }
        }

        const messageText = await relayWsMessageDataToText({
          data: event.data,
        });
        if (!messageText) {
          args.writeLine('RECV unknown_payload');
          return;
        }

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(messageText) as Record<string, unknown>;
        } catch {
          args.writeLine(`RECV non_json_payload bytes=${Buffer.from(messageText, 'utf8').length}`);
          return;
        }
        args.writeLine(`RECV ${String(payload.type ?? 'unknown')}`);
        if (payload.type === 'auth_challenge') {
          if (
            typeof payload.challengeText !== 'string'
            || typeof payload.challengeId !== 'string'
          ) {
            throw new Error('Received invalid auth_challenge payload.');
          }

          const signatureBase64 = sign(
            null,
            Buffer.from(payload.challengeText, 'utf8'),
            keyPair.privateKey,
          ).toString('base64');
          socket.send(JSON.stringify({
            type: 'auth_challenge_response',
            publicKeyBase32,
            challengeId: payload.challengeId,
            signatureBase64,
          }));
          args.writeLine('SENT auth_challenge_response');
          return;
        }
        if (payload.type === 'auth_ok') {
          args.writeLine('AUTH SUCCESS');
          return;
        }
        if (payload.type === 'auth_error') {
          clearTimeout(stopTimer);
          socket.close();
          reject(new Error(`Relay returned auth_error: ${String(payload.code ?? 'unknown')}`));
        }
      } catch (error) {
        clearTimeout(stopTimer);
        socket.close();
        reject(error);
      }
    };

    socket.onerror = (): void => {
      clearTimeout(stopTimer);
      reject(new Error('WebSocket connection failed.'));
    };
  });
}

/**
 * Converts websocket message event payload into a binary buffer when possible.
 */
export async function relayWsMessageDataToBuffer(
  args: {
    data: unknown;
  },
): Promise<Buffer | undefined> {
  if (Buffer.isBuffer(args.data)) {
    return args.data;
  }

  if (args.data instanceof ArrayBuffer) {
    return Buffer.from(args.data);
  }

  if (typeof Blob !== 'undefined' && args.data instanceof Blob) {
    const arrayBuffer = await args.data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  return undefined;
}

/**
 * Executes the manual relay websocket inbox listener from CLI arguments.
 */
async function main(): Promise<void> {
  const config = resolveRelayWsInboxConfig({
    argv: process.argv,
  });
  await runRelayWsInboxListener({
    config,
    writeLine: (line: string): void => {
      process.stdout.write(`${line}\n`);
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
