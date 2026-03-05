import { beforeAll, describe, expect, it } from 'vitest';

import {
  createGatewayRuntimeActionInvoker,
  runShellExecRuntimeAction,
} from '@engine/gateway/index';
import { createInboundMessage } from '@tests/helpers/inbound-message';

let unknownActionError = '';
let shellExecExitCode = -1;
let shellExecTimedOut = false;
let shellExecShell = '';
let shellExecCwd = '';
let invalidWorkdirError = '';
let shellExecFromInvokerExitCode = -1;

function createShellInvokerInboundMessage(): ReturnType<typeof createInboundMessage> {
  return createInboundMessage({
    personaId: 'persona-test',
    messageId: '<inbound@example.com>',
    threadId: 'thread-1',
    subject: 'Hello',
    text: 'Body',
  });
}

beforeAll(async (): Promise<void> => {
  const runResult = await runShellExecRuntimeAction({
    payload: {
      command: 'echo hello',
      timeoutMs: 1000,
      maxOutputChars: 100,
    },
    executeShellCommandFn: async (): Promise<{
      exitCode: number;
      stdout: string;
      stderr: string;
      timedOut: boolean;
      durationMs: number;
      shell: string;
      shellType: string;
      cwd: string;
      platform: NodeJS.Platform;
      stdoutTruncated: boolean;
      stderrTruncated: boolean;
    }> => ({
      exitCode: 0,
      stdout: 'hello',
      stderr: '',
      timedOut: false,
      durationMs: 7,
      shell: '/bin/bash',
      shellType: 'bash',
      cwd: '/workspace',
      platform: 'linux',
      stdoutTruncated: false,
      stderrTruncated: false,
    }),
  });
  shellExecExitCode = Number(runResult.exitCode ?? -1);
  shellExecTimedOut = Boolean(runResult.timedOut);
  shellExecShell = String(runResult.shell ?? '');
  shellExecCwd = String(runResult.cwd ?? '');

  try {
    await runShellExecRuntimeAction({
      payload: {
        command: 'pwd',
        workdir: '../outside',
      },
    });
  } catch (error) {
    invalidWorkdirError = (error as Error).message;
  }

  const invoker = createGatewayRuntimeActionInvoker({
    message: createShellInvokerInboundMessage(),
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
  });

  try {
    await invoker({
      action: 'tool.unknown',
      payload: {},
    });
  } catch (error) {
    unknownActionError = (error as Error).message;
  }

  const invokedResult = await invoker({
    action: 'shell.exec',
    payload: {
      command: 'echo shell-test',
      timeoutMs: 2000,
      maxOutputChars: 2000,
    },
  });
  shellExecFromInvokerExitCode = Number(invokedResult.exitCode ?? -1);
});

describe('gateway runtime action invoker shell action', () => {
  it('rejects unknown runtime actions', () => {
    expect(unknownActionError.includes('Unsupported runtime action')).toBe(true);
  });

  it('returns shell.exec exit code from runtime shell execution', () => {
    expect(shellExecExitCode).toBe(0);
  });

  it('returns shell.exec timeout metadata from runtime shell execution', () => {
    expect(shellExecTimedOut).toBe(false);
  });

  it('returns shell executable metadata from runtime shell execution', () => {
    expect(shellExecShell.includes('bash')).toBe(true);
  });

  it('returns shell cwd metadata from runtime shell execution', () => {
    expect(shellExecCwd).toBe('/workspace');
  });

  it('blocks shell.exec workdir path traversal outside workspace root', () => {
    expect(invalidWorkdirError.includes('outside workspace root')).toBe(true);
  });

  it('supports shell.exec through gateway runtime action invoker', () => {
    expect(shellExecFromInvokerExitCode).toBe(0);
  });
});
