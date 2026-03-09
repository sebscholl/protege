import { getDefaultPrettyLogTheme, readPrettyLogTheme } from '@relay/src/shared/theme';
import { readRelayRuntimeConfig } from '@relay/src/config';
import { startRelayServer } from '@relay/src/index';
import { createRelayConsoleLogger } from '@relay/src/logger';

/**
 * Starts the relay HTTP runtime process and reports bind details to stdout.
 */
async function main(): Promise<void> {
  const config = readRelayRuntimeConfig();
  const logger = createRelayConsoleLogger({
    consoleLogFormat: config.logging.consoleLogFormat,
    prettyLogTheme: readPrettyLogTheme({
      themeConfigPath: config.logging.prettyLogThemePath,
    }) ?? getDefaultPrettyLogTheme(),
  });
  const started = await startRelayServer({
    config,
    callbacks: {
      onWsAuthEvent: (args): void => {
        logger.info({
          event: `relay.ws.auth.${args.event}`,
          context: {
            remoteAddress: args.remoteAddress,
            publicKeyBase32: args.publicKeyBase32 ?? null,
            sessionRole: args.sessionRole ?? null,
            code: args.code ?? null,
          },
        });
      },
      onIngressAccepted: (args): void => {
        logger.info({
          event: 'relay.ingress.accepted',
          context: {
            recipientAddress: args.recipientAddress,
            streamId: args.streamId,
          },
        });
      },
      onIngressRejected: (args): void => {
        logger.error({
          event: 'relay.ingress.rejected',
          context: {
            recipientAddress: args.recipientAddress,
            reason: args.reason,
            stage: args.stage,
          },
        });
      },
      onOutboundQueued: (args): void => {
        logger.info({
          event: 'relay.outbound.queued',
          context: {
            streamKey: args.streamKey,
            mailFrom: args.mailFrom,
            rcptTo: args.rcptTo,
            socketId: args.socketId,
            publicKeyBase32: args.publicKeyBase32,
          },
        });
      },
      onOutboundSent: (args): void => {
        logger.info({
          event: 'relay.outbound.sent',
          context: {
            streamKey: args.streamKey,
            mailFrom: args.mailFrom,
            rcptTo: args.rcptTo,
            attemptCount: args.attemptCount,
            messageId: args.messageId,
            socketId: args.socketId,
            publicKeyBase32: args.publicKeyBase32,
          },
        });
      },
      onOutboundFailed: (args): void => {
        logger.error({
          event: 'relay.outbound.failed',
          context: {
            streamKey: args.streamKey,
            mailFrom: args.mailFrom,
            rcptTo: args.rcptTo,
            message: args.message,
            socketId: args.socketId,
            publicKeyBase32: args.publicKeyBase32,
          },
        });
      },
      onOutboundIgnored: (args): void => {
        logger.info({
          event: 'relay.outbound.ignored',
          context: {
            streamId: args.streamId,
            reason: args.reason,
            socketId: args.socketId,
            publicKeyBase32: args.publicKeyBase32,
          },
        });
      },
    },
  });
  logger.info({
    event: 'relay.started',
    context: {
      baseUrl: started.baseUrl,
      smtpEnabled: Boolean(started.smtpServer),
    },
  });
}

void main();
