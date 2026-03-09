import type { SMTPServerDataStream, SMTPServerSession } from 'smtp-server';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';

/**
 * Loads one email fixture from tests/fixtures/email and returns an SMTP data stream.
 */
export function createFixtureStream(
  args: {
    fixtureFileName: string;
  },
): SMTPServerDataStream {
  const fixturePath = join(
    process.cwd(),
    'tests',
    'fixtures',
    'email',
    args.fixtureFileName,
  );
  const fixtureText = readFileSync(fixturePath, 'utf8');
  return Readable.from(Buffer.from(fixtureText, 'utf8')) as SMTPServerDataStream;
}

/**
 * Creates one minimal SMTP session object used by inbound gateway tests.
 */
export function createFixtureSession(
  args: {
    sessionId?: string;
    mailFromAddress?: string;
    rcptToAddress?: string;
  } = {},
): SMTPServerSession {
  return {
    id: args.sessionId ?? 'session-1',
    envelope: {
      mailFrom: { address: args.mailFromAddress ?? 'sender@example.com', args: false },
      rcptTo: [{ address: args.rcptToAddress ?? 'protege@localhost', args: false }],
    },
    localAddress: '127.0.0.1',
    localPort: 2525,
    remoteAddress: '127.0.0.1',
    remotePort: 40000,
    secure: false,
    tlsOptions: {},
    clientHostname: 'localhost',
    hostNameAppearsAs: 'localhost',
    openingCommand: 'HELO',
    transmissionType: 'SMTP',
  } as unknown as SMTPServerSession;
}
