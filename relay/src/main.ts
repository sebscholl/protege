import { startRelayServer } from '@relay/src/index';

/**
 * Starts the relay HTTP runtime process and reports bind details to stdout.
 */
async function main(): Promise<void> {
  const started = await startRelayServer();
  process.stdout.write(`${JSON.stringify({
    scope: 'relay',
    event: 'relay.started',
    baseUrl: started.baseUrl,
    smtpEnabled: Boolean(started.smtpServer),
    timestamp: new Date().toISOString(),
  })}\n`);
}

void main();
