import { startRelayServer } from '@relay/src/index';

/**
 * Starts the relay HTTP runtime process and reports bind details to stdout.
 */
async function main(): Promise<void> {
  const started = await startRelayServer({
    callbacks: {
      onIngressAccepted: (args): void => {
        process.stdout.write(`${JSON.stringify({
          scope: 'relay',
          event: 'relay.ingress.accepted',
          recipientAddress: args.recipientAddress,
          streamId: args.streamId,
          timestamp: new Date().toISOString(),
        })}\n`);
      },
      onIngressRejected: (args): void => {
        process.stdout.write(`${JSON.stringify({
          scope: 'relay',
          event: 'relay.ingress.rejected',
          recipientAddress: args.recipientAddress,
          reason: args.reason,
          timestamp: new Date().toISOString(),
        })}\n`);
      },
      onOutboundQueued: (args): void => {
        process.stdout.write(`${JSON.stringify({
          scope: 'relay',
          event: 'relay.outbound.queued',
          streamKey: args.streamKey,
          mailFrom: args.mailFrom,
          rcptTo: args.rcptTo,
          socketId: args.socketId,
          publicKeyBase32: args.publicKeyBase32,
          timestamp: new Date().toISOString(),
        })}\n`);
      },
      onOutboundSent: (args): void => {
        process.stdout.write(`${JSON.stringify({
          scope: 'relay',
          event: 'relay.outbound.sent',
          streamKey: args.streamKey,
          mailFrom: args.mailFrom,
          rcptTo: args.rcptTo,
          attemptCount: args.attemptCount,
          messageId: args.messageId,
          socketId: args.socketId,
          publicKeyBase32: args.publicKeyBase32,
          timestamp: new Date().toISOString(),
        })}\n`);
      },
      onOutboundFailed: (args): void => {
        process.stdout.write(`${JSON.stringify({
          scope: 'relay',
          event: 'relay.outbound.failed',
          streamKey: args.streamKey,
          mailFrom: args.mailFrom,
          rcptTo: args.rcptTo,
          message: args.message,
          socketId: args.socketId,
          publicKeyBase32: args.publicKeyBase32,
          timestamp: new Date().toISOString(),
        })}\n`);
      },
      onOutboundIgnored: (args): void => {
        process.stdout.write(`${JSON.stringify({
          scope: 'relay',
          event: 'relay.outbound.ignored',
          streamId: args.streamId,
          reason: args.reason,
          socketId: args.socketId,
          publicKeyBase32: args.publicKeyBase32,
          timestamp: new Date().toISOString(),
        })}\n`);
      },
    },
  });
  process.stdout.write(`${JSON.stringify({
    scope: 'relay',
    event: 'relay.started',
    baseUrl: started.baseUrl,
    smtpEnabled: Boolean(started.smtpServer),
    timestamp: new Date().toISOString(),
  })}\n`);
}

void main();
