import { createTransport } from 'nodemailer';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  executeRegisteredTool,
  loadToolRegistry,
} from '@engine/harness/tool-registry';

let sentMessageId = '';
let toolNotFoundMessage = '';
let sentMessageSource = '';

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

  it('throws for unknown tool names', () => {
    expect(toolNotFoundMessage.includes('Tool not found')).toBe(true);
  });
});
