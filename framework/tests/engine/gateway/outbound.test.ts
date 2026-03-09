import type { SentMessageInfo } from 'nodemailer';

import { createTransport } from 'nodemailer';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { sendGatewayReply } from '@engine/gateway/outbound';

let messageSource = '';
let messageSourceWithAttachment = '';

beforeAll(async (): Promise<void> => {
  const transport = createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix',
  });

  const info = await sendGatewayReply({
    transport,
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
    request: {
      to: [{ address: 'receiver@example.com' }],
      from: { address: 'protege@localhost' },
      subject: 'Re: Gateway Test',
      text: 'reply body',
      inReplyTo: '<inbound@example.com>',
      references: ['<parent@example.com>'],
    },
  }) as SentMessageInfo;
  messageSource = info.message.toString('utf8');

  const infoWithAttachment = await sendGatewayReply({
    transport,
    logger: {
      info: (): void => undefined,
      error: (): void => undefined,
    },
    request: {
      to: [{ address: 'receiver@example.com' }],
      from: { address: 'protege@localhost' },
      subject: 'Re: Gateway Attachment Test',
      text: 'reply body with attachment',
      inReplyTo: '<inbound@example.com>',
      references: ['<parent@example.com>'],
      attachments: [
        {
          path: join(process.cwd(), 'tests', 'fixtures', 'email', 'email-plain.eml'),
          filename: 'fixture.eml',
          contentType: 'message/rfc822',
        },
      ],
    },
  }) as SentMessageInfo;
  messageSourceWithAttachment = infoWithAttachment.message.toString('utf8');
});

describe('gateway outbound sending', () => {
  it('sends message with in-reply-to header', () => {
    expect(messageSource.includes('In-Reply-To: <inbound@example.com>')).toBe(true);
  });

  it('sends message with references header chain', () => {
    expect(messageSource.includes('References: <parent@example.com> <inbound@example.com>')).toBe(true);
  });

  it('sends message with subject and body', () => {
    expect(messageSource.includes('Subject: Re: Gateway Test')).toBe(true);
  });

  it('includes attachment metadata when outbound request includes attachments', () => {
    expect(messageSourceWithAttachment.includes('filename=fixture.eml')).toBe(true);
  });
});
