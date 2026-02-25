import { beforeAll, describe, expect, it } from 'vitest';

import { createShellTool } from '@extensions/tools/shell/index';

let toolName = '';
let schemaType = '';
let runtimeAction = '';
let runtimeCommand = '';
let runtimeTimeoutMs = -1;
let runtimeWorkdir = '';
let runtimeMaxOutputChars = -1;
let exitCode = -1;
let missingCommandError = '';

beforeAll(async (): Promise<void> => {
  const tool = createShellTool();
  toolName = tool.name;
  schemaType = String(tool.inputSchema.type ?? '');

  const result = await tool.execute({
    input: {
      command: 'pwd',
      timeoutMs: 5000,
      workdir: 'engine',
      maxOutputChars: 4000,
    },
    context: {
      runtime: {
        invoke: async (
          args: {
            action: string;
            payload: Record<string, unknown>;
          },
        ): Promise<Record<string, unknown>> => {
          runtimeAction = args.action;
          runtimeCommand = String(args.payload.command ?? '');
          runtimeTimeoutMs = Number(args.payload.timeoutMs ?? -1);
          runtimeWorkdir = String(args.payload.workdir ?? '');
          runtimeMaxOutputChars = Number(args.payload.maxOutputChars ?? -1);
          return {
            exitCode: 0,
            stdout: '/tmp',
            stderr: '',
            timedOut: false,
            durationMs: 5,
          };
        },
      },
    },
  });
  exitCode = Number(result.exitCode ?? -1);

  try {
    await tool.execute({
      input: {
        timeoutMs: 10,
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({}),
        },
      },
    });
  } catch (error) {
    missingCommandError = (error as Error).message;
  }
});

describe('shell tool', () => {
  it('exposes expected tool name', () => {
    expect(toolName).toBe('shell');
  });

  it('exposes object input schema', () => {
    expect(schemaType).toBe('object');
  });

  it('invokes runtime action shell.exec', () => {
    expect(runtimeAction).toBe('shell.exec');
  });

  it('forwards command payload to runtime', () => {
    expect(runtimeCommand).toBe('pwd');
  });

  it('forwards timeout payload to runtime', () => {
    expect(runtimeTimeoutMs).toBe(5000);
  });

  it('forwards workdir payload to runtime', () => {
    expect(runtimeWorkdir).toBe('engine');
  });

  it('forwards maxOutputChars payload to runtime', () => {
    expect(runtimeMaxOutputChars).toBe(4000);
  });

  it('returns runtime shell.exec metadata unchanged', () => {
    expect(exitCode).toBe(0);
  });

  it('fails when required command is missing', () => {
    expect(missingCommandError.includes('command')).toBe(true);
  });
});
