import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import type { SMTPServer } from 'smtp-server';
import type { RelayWsConnectionSocket } from '@relay/src/ws-connection';
import type { RelayTunnelFrame } from '@relay/src/tunnel';

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

import type { RelayRuntimeConfig } from '@relay/src/config';
import { readRelayRuntimeConfig } from '@relay/src/config';
import {
  applyRelayOutboundTunnelFrame,
  createRelayOutboundTunnelState,
  sendRelayOutboundMime,
} from '@relay/src/outbound';
import { startRelaySmtpServer, stopRelaySmtpServer } from '@relay/src/smtp-server';
import { createRelaySessionRegistry } from '@relay/src/session-registry';
import { createRelayStore } from '@relay/src/storage';
import { attachRelayWsConnection } from '@relay/src/ws-connection';

/**
 * Represents one started relay server runtime instance.
 */
export type StartedRelayServer = {
  server: Server;
  webSocketServer: WebSocketServer;
  smtpServer?: SMTPServer;
  baseUrl: string;
};

/**
 * Represents runtime state for relay websocket sessions and auth storage.
 */
export type RelayRuntimeState = {
  store: ReturnType<typeof createRelayStore>;
  sessionRegistry: ReturnType<typeof createRelaySessionRegistry>;
};

/**
 * Represents one minimal upgrade-aware websocket server contract.
 */
export type RelayWebSocketUpgradeServer = {
  handleUpgrade: (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    callback: (ws: RelayWsConnectionSocket) => void,
  ) => void;
};

/**
 * Represents one set of optional relay lifecycle callbacks for runtime observability.
 */
export type RelayServerCallbacks = {
  onIngressAccepted?: (
    args: {
      recipientAddress: string;
      streamId: string;
    },
  ) => void;
  onIngressRejected?: (
    args: {
      recipientAddress: string;
      reason: string;
    },
  ) => void;
  onOutboundQueued?: (
    args: {
      streamKey: string;
      mailFrom: string;
      rcptTo: string;
      socketId: string;
      publicKeyBase32: string;
    },
  ) => void;
  onOutboundSent?: (
    args: {
      streamKey: string;
      mailFrom: string;
      rcptTo: string;
      attemptCount: number;
      messageId: string | null;
      socketId: string;
      publicKeyBase32: string;
    },
  ) => void;
  onOutboundFailed?: (
    args: {
      streamKey: string;
      mailFrom: string;
      rcptTo: string;
      message: string;
      socketId: string;
      publicKeyBase32: string;
    },
  ) => void;
  onOutboundIgnored?: (
    args: {
      streamId: string;
      reason: string;
      socketId: string;
      publicKeyBase32: string;
    },
  ) => void;
};

/**
 * Creates in-memory relay runtime state used by websocket authentication/session flows.
 */
export function createRelayRuntimeState(): RelayRuntimeState {
  return {
    store: createRelayStore(),
    sessionRegistry: createRelaySessionRegistry(),
  };
}

/**
 * Creates one relay HTTP request handler for control/health endpoints.
 */
export function createRelayRequestHandler(): (
  request: IncomingMessage,
  response: ServerResponse,
) => void {
  return (
    request: IncomingMessage,
    response: ServerResponse,
  ): void => {
    if (request.method === 'GET' && request.url === '/health') {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        status: 'ok',
      }));
      return;
    }

    response.statusCode = 404;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({
      error: 'not_found',
    }));
  };
}

/**
 * Creates one relay upgrade handler that accepts websocket sessions on `/ws`.
 */
export function createRelayUpgradeHandler(
  args: {
    webSocketServer: RelayWebSocketUpgradeServer;
    runtimeState: RelayRuntimeState;
    nowIso: () => string;
    onOutboundTunnelFrame?: (
      args: {
        frame: RelayTunnelFrame;
        socketId: string;
        publicKeyBase32: string;
      },
    ) => void;
  },
): (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => void {
  return (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void => {
    if (request.url !== '/ws') {
      socket.destroy();
      return;
    }

    args.webSocketServer.handleUpgrade(request, socket, head, (ws: RelayWsConnectionSocket): void => {
      attachRelayWsConnection({
        ws,
        runtime: {
          store: args.runtimeState.store,
          registry: args.runtimeState.sessionRegistry,
          onOutboundTunnelFrame: args.onOutboundTunnelFrame,
        },
        nowIso: args.nowIso,
      });
    });
  };
}

/**
 * Starts the relay server on one configured host/port and returns its base url.
 */
export async function startRelayServer(
  args: {
    config?: RelayRuntimeConfig;
    callbacks?: RelayServerCallbacks;
    sendOutboundMimeFn?: typeof sendRelayOutboundMime;
  } = {},
): Promise<StartedRelayServer> {
  const config = args.config ?? readRelayRuntimeConfig();
  const server = createServer(createRelayRequestHandler());
  const runtimeState = createRelayRuntimeState();
  const outboundTunnelState = createRelayOutboundTunnelState();
  const sendOutboundMimeFn = args.sendOutboundMimeFn ?? sendRelayOutboundMime;
  const webSocketServer = new WebSocketServer({
    noServer: true,
  });
  server.on('upgrade', createRelayUpgradeHandler({
    webSocketServer,
    runtimeState,
    nowIso: (): string => new Date().toISOString(),
    onOutboundTunnelFrame: (frameArgs): void => {
      const result = applyRelayOutboundTunnelFrame({
        state: outboundTunnelState,
        socketId: frameArgs.socketId,
        frame: frameArgs.frame,
      });
      if (result.ignoredReason) {
        args.callbacks?.onOutboundIgnored?.({
          streamId: frameArgs.frame.streamId,
          reason: result.ignoredReason,
          socketId: frameArgs.socketId,
          publicKeyBase32: frameArgs.publicKeyBase32,
        });
        return;
      }
      if (!result.completed) {
        return;
      }

      args.callbacks?.onOutboundQueued?.({
        streamKey: result.completed.streamKey,
        mailFrom: result.completed.mailFrom,
        rcptTo: result.completed.rcptTo,
        socketId: frameArgs.socketId,
        publicKeyBase32: frameArgs.publicKeyBase32,
      });
      void sendOutboundMimeFn({
        delivery: result.completed,
        onAttemptError: (attemptErrorArgs): void => {
          args.callbacks?.onOutboundFailed?.({
            streamKey: result.completed?.streamKey ?? frameArgs.frame.streamId,
            mailFrom: result.completed?.mailFrom ?? '',
            rcptTo: result.completed?.rcptTo ?? '',
            message: `attempt=${attemptErrorArgs.attempt} ${attemptErrorArgs.message}`,
            socketId: frameArgs.socketId,
            publicKeyBase32: frameArgs.publicKeyBase32,
          });
        },
      }).then((deliveryInfo): void => {
        args.callbacks?.onOutboundSent?.({
          streamKey: result.completed?.streamKey ?? frameArgs.frame.streamId,
          mailFrom: result.completed?.mailFrom ?? '',
          rcptTo: result.completed?.rcptTo ?? '',
          attemptCount: deliveryInfo.attemptCount,
          messageId: deliveryInfo.messageId,
          socketId: frameArgs.socketId,
          publicKeyBase32: frameArgs.publicKeyBase32,
        });
      }).catch((error: Error): void => {
        args.callbacks?.onOutboundFailed?.({
          streamKey: result.completed?.streamKey ?? frameArgs.frame.streamId,
          mailFrom: result.completed?.mailFrom ?? '',
          rcptTo: result.completed?.rcptTo ?? '',
          message: error.message,
          socketId: frameArgs.socketId,
          publicKeyBase32: frameArgs.publicKeyBase32,
        });
      });
    },
  }));

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      resolve();
    });
  });

  const smtpServer = await startRelaySmtpServer({
    config: config.smtp,
    runtimeState,
    onAccepted: args.callbacks?.onIngressAccepted,
    onRejected: args.callbacks?.onIngressRejected,
  });

  const addressInfo = server.address() as AddressInfo;
  return {
    server,
    webSocketServer,
    smtpServer,
    baseUrl: `http://${addressInfo.address}:${addressInfo.port}`,
  };
}

/**
 * Stops one running relay server and resolves when the close is complete.
 */
export async function stopRelayServer(
  args: {
    server: Server;
    webSocketServer?: WebSocketServer;
    smtpServer?: SMTPServer;
  },
): Promise<void> {
  if (args.smtpServer) {
    await stopRelaySmtpServer({
      server: args.smtpServer,
    });
  }

  if (args.webSocketServer) {
    await new Promise<void>((resolve): void => {
      args.webSocketServer?.close(() => {
        resolve();
      });
    });
  }

  await new Promise<void>((resolve, reject) => {
    args.server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
