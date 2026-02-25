import { createTransport } from 'nodemailer';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  executeRegisteredTool,
  loadToolRegistry,
} from '@engine/harness/tool-registry';

let sentMessageId = '';
let toolNotFoundMessage = '';
let sentMessageSource = '';
let readFileContent = '';
let globPathsCount = -1;
let shellExitCode = -1;

beforeAll(async (): Promise<void> => {
  const registry = await loadToolRegistry();
  const transport = createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix',
  });
  const result = await executeRegisteredTool({
    registry,
    name: 'send_email',
    input: {
      to: ['receiver@example.com'],
      subject: 'Tool registry execution',
      text: 'Hello from send_email.',
      from: 'protege@localhost',
    },
    context: {
      runtime: {
        invoke: async (
          args: {
            action: string;
            payload: Record<string, unknown>;
          },
        ): Promise<Record<string, unknown>> => {
          if (args.action !== 'email.send') {
            throw new Error(`Unsupported action: ${args.action}`);
          }

          const info = await transport.sendMail({
            to: args.payload.to as string[],
            from: args.payload.from as string,
            cc: args.payload.cc as string[] | undefined,
            bcc: args.payload.bcc as string[] | undefined,
            subject: args.payload.subject as string,
            text: args.payload.text as string,
            html: args.payload.html as string | undefined,
            inReplyTo: args.payload.inReplyTo as string | undefined,
            references: args.payload.references as string[] | undefined,
            headers: args.payload.headers as Record<string, string> | undefined,
          });
          sentMessageSource = info.message.toString('utf8');
          return {
            messageId: info.messageId,
          };
        },
      },
    },
  });
  sentMessageId = String(result.messageId ?? '');

  const readResult = await executeRegisteredTool({
    registry,
    name: 'read_file',
    input: {
      path: 'README.md',
    },
    context: {
      runtime: {
        invoke: async (
          args: {
            action: string;
            payload: Record<string, unknown>;
          },
        ): Promise<Record<string, unknown>> => {
          if (args.action !== 'file.read') {
            throw new Error(`Unsupported action: ${args.action}`);
          }
          return {
            content: `read:${String(args.payload.path ?? '')}`,
          };
        },
      },
    },
  });
  readFileContent = String(readResult.content ?? '');

  const globResult = await executeRegisteredTool({
    registry,
    name: 'glob',
    input: {
      pattern: '**/*.md',
    },
    context: {
      runtime: {
        invoke: async (
          args: {
            action: string;
            payload: Record<string, unknown>;
          },
        ): Promise<Record<string, unknown>> => {
          if (args.action !== 'file.glob') {
            throw new Error(`Unsupported action: ${args.action}`);
          }
          return {
            paths: [String(args.payload.pattern ?? '')],
          };
        },
      },
    },
  });
  globPathsCount = Array.isArray(globResult.paths) ? globResult.paths.length : -1;

  const shellResult = await executeRegisteredTool({
    registry,
    name: 'shell',
    input: {
      command: 'pwd',
    },
    context: {
      runtime: {
        invoke: async (
          args: {
            action: string;
            payload: Record<string, unknown>;
          },
        ): Promise<Record<string, unknown>> => {
          if (args.action !== 'shell.exec') {
            throw new Error(`Unsupported action: ${args.action}`);
          }
          return {
            exitCode: Number((args.payload.command as string).length > 0 ? 0 : 1),
            stdout: '/tmp',
            stderr: '',
            timedOut: false,
            durationMs: 1,
          };
        },
      },
    },
  });
  shellExitCode = Number(shellResult.exitCode ?? -1);

  try {
    await executeRegisteredTool({
      registry,
      name: 'missing_tool',
      input: {},
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({}),
        },
      },
    });
  } catch (error) {
    toolNotFoundMessage = (error as Error).message;
  }
});

describe('harness tool execution', () => {
  it('executes registered tool and returns result payload', () => {
    expect(sentMessageId.length > 0).toBe(true);
  });

  it('executes send_email via SMTP transport payload fields', () => {
    expect(sentMessageSource.includes('Subject: Tool registry execution')).toBe(true);
  });

  it('executes read_file via runtime file.read payload fields', () => {
    expect(readFileContent).toBe('read:README.md');
  });

  it('executes glob via runtime file.glob payload fields', () => {
    expect(globPathsCount).toBe(1);
  });

  it('executes shell via runtime shell.exec payload fields', () => {
    expect(shellExitCode).toBe(0);
  });

  it('throws for unknown tool names', () => {
    expect(toolNotFoundMessage.includes('Tool not found')).toBe(true);
  });
});
