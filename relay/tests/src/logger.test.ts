import { beforeAll, describe, expect, it } from 'vitest';

import { getDefaultPrettyLogTheme } from '@relay/src/shared/theme';
import { createRelayLogPayload, formatRelayConsoleLogLine } from '@relay/src/logger';

let jsonLine = '';
let prettyLine = '';
let payloadScope = '';
let payloadEvent = '';

beforeAll((): void => {
  const payload = createRelayLogPayload({
    level: 'info',
    event: 'relay.ingress.rejected',
    context: {
      recipientAddress: 'missing@relay-protege-mail.com',
      reason: 'recipient_not_connected',
      stage: 'rcpt',
    },
  });
  payloadScope = payload.scope;
  payloadEvent = payload.event;
  jsonLine = formatRelayConsoleLogLine({
    payload,
    consoleLogFormat: 'json',
    prettyLogTheme: getDefaultPrettyLogTheme(),
  });
  prettyLine = formatRelayConsoleLogLine({
    payload,
    consoleLogFormat: 'pretty',
    prettyLogTheme: getDefaultPrettyLogTheme(),
  });
});

describe('relay logger payload normalization', () => {
  it('sets relay scope on structured payloads', () => {
    expect(payloadScope).toBe('relay');
  });

  it('keeps explicit event names on structured payloads', () => {
    expect(payloadEvent).toBe('relay.ingress.rejected');
  });
});

describe('relay logger console formatting', () => {
  it('formats json lines as single-line json output', () => {
    expect(jsonLine.trim().startsWith('{')).toBe(true);
  });

  it('includes context keys in json output', () => {
    expect(jsonLine.includes('"stage":"rcpt"')).toBe(true);
  });

  it('formats pretty lines with multiline key-value context', () => {
    expect(
      prettyLine.includes('\n')
      && prettyLine.includes('reason')
      && prettyLine.includes('recipient_not_connected'),
    ).toBe(true);
  });

  it('adds one blank-line separator in pretty mode', () => {
    expect(prettyLine.endsWith('\n\n')).toBe(true);
  });
});
