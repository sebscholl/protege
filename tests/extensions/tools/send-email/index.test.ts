import { createTransport } from 'nodemailer';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  createSendEmailTool,
  readSendEmailToolConfig,
} from '@extensions/tools/send-email/index';

let toolName = '';
let schemaType = '';
let sentMessageSource = '';
let validationMessage = '';
let configDefaultFromAddress = '';

beforeAll(async (): Promise<void> => {
  const config = readSendEmailToolConfig();
  configDefaultFromAddress = config.defaultFromAddress ?? '';
  const tool = createSendEmailTool();
  toolName = tool.name;
  schemaType = String(tool.inputSchema.type ?? '');

  const transport = createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix',
  });
  await tool.execute({
    input: {
      to: ['receiver@example.com'],
      subject: 'Tool extension execution',
      text: 'Hello from extension.',
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

  try {
    await tool.execute({
      input: {
        to: ['receiver@example.com'],
        text: 'Missing subject.',
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({ messageId: 'unused' }),
        },
      },
    });
  } catch (error) {
    validationMessage = (error as Error).message;
  }
});

describe('send-email tool extension', () => {
  it('declares send_email as the stable tool name', () => {
    expect(toolName).toBe('send_email');
  });

  it('declares object input schema for provider tool exposure', () => {
    expect(schemaType).toBe('object');
  });

  it('reads default from-address from tool config', () => {
    expect(configDefaultFromAddress).toBe('protege@localhost');
  });

  it('builds and sends outbound email payload using tool executor', () => {
    expect(sentMessageSource.includes('Subject: Tool extension execution')).toBe(true);
  });

  it('rejects invalid payloads missing required fields', () => {
    expect(validationMessage.includes('subject')).toBe(true);
  });
});
