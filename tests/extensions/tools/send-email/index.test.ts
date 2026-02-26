import { createTransport } from 'nodemailer';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  createSendEmailTool,
  readSendEmailToolConfig,
} from '@extensions/tools/send-email/index';

let toolName = '';
let schemaType = '';
let toolDescription = '';
let sentMessageSource = '';
let validationMessage = '';
let invalidRecipientMessage = '';
let plusAddressAccepted = false;
let subdomainAddressAccepted = false;
let mixedCaseAddressAccepted = false;
let localhostAddressAccepted = false;
let invalidAddressMessage = '';
let whitespaceAddressMessage = '';
let missingTopLevelDomainMessage = '';
let threadingModePayloadValue = '';
let invalidThreadingModeMessage = '';
let forwardedThreadingMode = '';
let forwardedAttachmentPath = '';
let invalidAttachmentMessage = '';

beforeAll(async (): Promise<void> => {
  void readSendEmailToolConfig();
  const tool = createSendEmailTool();
  toolName = tool.name;
  toolDescription = tool.description;
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
            from: (args.payload.from as string | undefined) ?? 'persona@example.com',
            cc: args.payload.cc as string[] | undefined,
            bcc: args.payload.bcc as string[] | undefined,
            subject: args.payload.subject as string,
            text: args.payload.text as string,
            html: args.payload.html as string | undefined,
            inReplyTo: args.payload.inReplyTo as string | undefined,
            references: args.payload.references as string[] | undefined,
            headers: args.payload.headers as Record<string, string> | undefined,
          });
          threadingModePayloadValue = String(args.payload.threadingMode ?? '');
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

  try {
    await tool.execute({
      input: {
        to: ['user'],
        subject: 'Invalid recipient',
        text: 'Hello.',
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({ messageId: 'unused' }),
        },
      },
    });
  } catch (error) {
    invalidRecipientMessage = (error as Error).message;
  }

  try {
    await tool.execute({
      input: {
        to: ['first.last+alerts@example.com'],
        subject: 'Plus accepted',
        text: 'Hello.',
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({ messageId: 'ok-1' }),
        },
      },
    });
    plusAddressAccepted = true;
  } catch {
    plusAddressAccepted = false;
  }

  try {
    await tool.execute({
      input: {
        to: ['ops@mail.service.example.com'],
        subject: 'Subdomain accepted',
        text: 'Hello.',
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({ messageId: 'ok-2' }),
        },
      },
    });
    subdomainAddressAccepted = true;
  } catch {
    subdomainAddressAccepted = false;
  }

  try {
    await tool.execute({
      input: {
        to: ['Patricia.Smith@Example.COM'],
        subject: 'Case accepted',
        text: 'Hello.',
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({ messageId: 'ok-3' }),
        },
      },
    });
    mixedCaseAddressAccepted = true;
  } catch {
    mixedCaseAddressAccepted = false;
  }

  try {
    await tool.execute({
      input: {
        to: ['user@localhost'],
        subject: 'Localhost accepted',
        text: 'Hello.',
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({ messageId: 'ok-4' }),
        },
      },
    });
    localhostAddressAccepted = true;
  } catch {
    localhostAddressAccepted = false;
  }

  try {
    await tool.execute({
      input: {
        to: ['invalid-address'],
        subject: 'Invalid',
        text: 'Hello.',
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({ messageId: 'unused' }),
        },
      },
    });
  } catch (error) {
    invalidAddressMessage = (error as Error).message;
  }

  try {
    await tool.execute({
      input: {
        to: ['  sender@example.com'],
        subject: 'Whitespace invalid',
        text: 'Hello.',
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({ messageId: 'unused' }),
        },
      },
    });
  } catch (error) {
    whitespaceAddressMessage = (error as Error).message;
  }

  try {
    await tool.execute({
      input: {
        to: ['sender@example'],
        subject: 'Missing TLD',
        text: 'Hello.',
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({ messageId: 'unused' }),
        },
      },
    });
  } catch (error) {
    missingTopLevelDomainMessage = (error as Error).message;
  }

  try {
    await tool.execute({
      input: {
        to: ['sender@example.com'],
        subject: 'New thread mode',
        text: 'Hello.',
        threadingMode: 'new_thread',
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

            forwardedThreadingMode = String(args.payload.threadingMode ?? '');
            return { messageId: 'threading-mode-forwarded' };
          },
        },
      },
    });
  } catch {
    forwardedThreadingMode = '';
  }

  try {
    await tool.execute({
      input: {
        to: ['sender@example.com'],
        subject: 'Invalid threading mode',
        text: 'Hello.',
        threadingMode: 'invalid_mode',
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({ messageId: 'unused' }),
        },
      },
    });
  } catch (error) {
    invalidThreadingModeMessage = (error as Error).message;
  }

  try {
    await tool.execute({
      input: {
        to: ['sender@example.com'],
        subject: 'Attachment forwarding',
        text: 'Hello.',
        attachments: [
          {
            path: '/tmp/report.txt',
          },
        ],
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
            const attachments = Array.isArray(args.payload.attachments)
              ? args.payload.attachments as Array<Record<string, unknown>>
              : [];
            forwardedAttachmentPath = String(attachments[0]?.path ?? '');
            return { messageId: 'attachment-forwarded' };
          },
        },
      },
    });
  } catch {
    forwardedAttachmentPath = '';
  }

  try {
    await tool.execute({
      input: {
        to: ['sender@example.com'],
        subject: 'Invalid attachment path',
        text: 'Hello.',
        attachments: [
          {
            path: '',
          },
        ],
      },
      context: {
        runtime: {
          invoke: async (): Promise<Record<string, unknown>> => ({ messageId: 'unused' }),
        },
      },
    });
  } catch (error) {
    invalidAttachmentMessage = (error as Error).message;
  }
});

describe('send-email tool extension', () => {
  it('declares send_email as the stable tool name', () => {
    expect(toolName).toBe('send_email');
  });

  it('declares object input schema for provider tool exposure', () => {
    expect(schemaType).toBe('object');
  });

  it('documents that user-visible replies require send_email delivery', () => {
    expect(toolDescription.includes('user to receive your response')).toBe(true);
  });

  it('builds and sends outbound email payload using tool executor', () => {
    expect(sentMessageSource.includes('Subject: Tool extension execution')).toBe(true);
  });

  it('rejects invalid payloads missing required fields', () => {
    expect(validationMessage.includes('subject')).toBe(true);
  });

  it('rejects recipient placeholders that are not valid email addresses', () => {
    expect(invalidRecipientMessage.includes('valid email addresses')).toBe(true);
  });

  it('accepts plus-addressing recipient formats', () => {
    expect(plusAddressAccepted).toBe(true);
  });

  it('accepts recipient addresses on deep subdomains', () => {
    expect(subdomainAddressAccepted).toBe(true);
  });

  it('accepts mixed-case recipient addresses', () => {
    expect(mixedCaseAddressAccepted).toBe(true);
  });

  it('accepts localhost recipient addresses for local chat flows', () => {
    expect(localhostAddressAccepted).toBe(true);
  });

  it('rejects malformed recipients without an at-sign/domain format', () => {
    expect(invalidAddressMessage.includes('valid email addresses')).toBe(true);
  });

  it('rejects recipients with leading whitespace', () => {
    expect(whitespaceAddressMessage.includes('valid email addresses')).toBe(true);
  });

  it('rejects recipients missing a top-level domain segment', () => {
    expect(missingTopLevelDomainMessage.includes('valid email addresses')).toBe(true);
  });

  it('defaults threading mode to reply_current behavior when omitted', () => {
    expect(threadingModePayloadValue).toBe('');
  });

  it('rejects unsupported threading mode values', () => {
    expect(invalidThreadingModeMessage.includes('threadingMode')).toBe(true);
  });

  it('forwards explicit new_thread threading mode to runtime payloads', () => {
    expect(forwardedThreadingMode).toBe('new_thread');
  });

  it('forwards attachment descriptors to runtime email.send payloads', () => {
    expect(forwardedAttachmentPath).toBe('/tmp/report.txt');
  });

  it('rejects attachments missing required file paths', () => {
    expect(invalidAttachmentMessage.includes('attachments[0].path')).toBe(true);
  });
});
