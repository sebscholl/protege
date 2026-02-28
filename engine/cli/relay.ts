import { parseRelayBootstrapArgs, runRelayBootstrap } from '@engine/cli/relay-bootstrap';
import { emitCliOutput } from '@engine/cli/output';

/**
 * Dispatches relay-specific CLI commands.
 */
export function runRelayCli(
  args: {
    argv: string[];
  },
): void {
  const json = args.argv.includes('--json');
  const [action, ...rest] = args.argv;
  if (!action) {
    throw new Error('Usage: protege relay <bootstrap> [options]');
  }

  if (action === 'bootstrap') {
    const bootstrapArgs = parseRelayBootstrapArgs({
      argv: rest,
    });
    const result = runRelayBootstrap({
      bootstrapArgs,
    });
    emitCliOutput({
      mode: json ? 'json' : 'pretty',
      jsonValue: result,
      prettyText: renderRelayBootstrapResult({
        result,
      }),
    });
    return;
  }

  throw new Error('Usage: protege relay <bootstrap> [options]');
}

/**
 * Renders one relay bootstrap result into readable output.
 */
export function renderRelayBootstrapResult(
  args: {
    result: ReturnType<typeof runRelayBootstrap>;
  },
): string {
  return [
    'Relay Bootstrap Completed',
    `relayEnabled: ${args.result.relayEnabled}`,
    `relayWsUrl: ${args.result.relayWsUrl}`,
    `personaId: ${args.result.personaId}`,
    `createdPersona: ${args.result.createdPersona}`,
    `gatewayConfigPath: ${args.result.gatewayConfigPath}`,
  ].join('\n');
}
