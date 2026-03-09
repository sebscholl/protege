import type { AuthenticateResult } from 'mailauth';
import type { SMTPServerSession } from 'smtp-server';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  evaluateRelayAuthSignals,
  mapMailauthStatusToSignal,
  toRelayAuthSignalsFromAuthenticateResult,
} from '@relay/src/auth-evaluator';

let mapPassSignal = '';
let mapFailSignal = '';
let mapUnknownSignal = '';
let mappedSignalsSpf = '';
let mappedSignalsDkim = '';
let mappedSignalsDmarc = '';
let evaluatedSignalsSpf = '';
let evaluatedSignalsDkim = '';
let evaluatedSignalsDmarc = '';

/**
 * Creates one minimal SMTP session for relay auth evaluator tests.
 */
function createRelaySession(): SMTPServerSession {
  return {
    id: 'session-1',
    remoteAddress: '203.0.113.55',
    hostNameAppearsAs: 'mx.example.net',
    envelope: {
      mailFrom: {
        address: 'sender@example.com',
        args: false,
      },
      rcptTo: [
        {
          address: 'recipient@example.com',
          args: false,
        },
      ],
    },
  } as unknown as SMTPServerSession;
}

beforeAll(async (): Promise<void> => {
  mapPassSignal = mapMailauthStatusToSignal({
    statusResult: 'pass',
  });
  mapFailSignal = mapMailauthStatusToSignal({
    statusResult: 'softfail',
  });
  mapUnknownSignal = mapMailauthStatusToSignal({
    statusResult: 'none',
  });

  const mapped = toRelayAuthSignalsFromAuthenticateResult({
    result: {
      dkim: {
        headerFrom: ['example.com'],
        envelopeFrom: 'sender@example.com',
        results: [
          {
            signingDomain: 'example.com',
            status: {
              result: 'pass',
            },
            info: 'dkim=pass',
          },
        ],
      },
      spf: {
        domain: 'example.com',
        'client-ip': '203.0.113.55',
        status: {
          result: 'pass',
        },
        header: 'spf=pass',
        info: 'spf=pass',
      },
      dmarc: {
        domain: 'example.com',
        status: {
          result: 'fail',
        },
        policy: 'reject',
        p: 'reject',
        header: 'dmarc=fail',
        info: 'dmarc=fail',
      },
      arc: false,
      bimi: false,
      headers: '',
    } as unknown as AuthenticateResult,
  });
  mappedSignalsSpf = mapped.spf;
  mappedSignalsDkim = mapped.dkim;
  mappedSignalsDmarc = mapped.dmarc;

  const evaluated = await evaluateRelayAuthSignals({
    rawMimeBuffer: Buffer.from('From: sender@example.com\r\n\r\nhello', 'utf8'),
    session: createRelaySession(),
    mailFrom: 'sender@example.com',
    authenticateFn: async (): Promise<AuthenticateResult> => ({
      dkim: {
        headerFrom: ['example.com'],
        envelopeFrom: 'sender@example.com',
        results: [
          {
            signingDomain: 'example.com',
            status: {
              result: 'fail',
            },
            info: 'dkim=fail',
          },
        ],
      },
      spf: {
        domain: 'example.com',
        'client-ip': '203.0.113.55',
        status: {
          result: 'pass',
        },
        header: 'spf=pass',
        info: 'spf=pass',
      },
      dmarc: {
        domain: 'example.com',
        status: {
          result: 'none',
        },
        policy: 'none',
        p: 'none',
        sp: 'none',
        alignment: {
          spf: {
            result: 'none',
            strict: false,
          },
          dkim: {
            result: 'none',
            strict: false,
            underSized: false,
          },
        },
        info: 'dmarc=none',
      },
      arc: false,
      bimi: false,
      headers: '',
    }),
  });
  evaluatedSignalsSpf = evaluated.spf;
  evaluatedSignalsDkim = evaluated.dkim;
  evaluatedSignalsDmarc = evaluated.dmarc;
});

describe('relay auth evaluator', () => {
  it('maps pass status to pass auth signal', () => {
    expect(mapPassSignal).toBe('pass');
  });

  it('maps fail-like status to fail auth signal', () => {
    expect(mapFailSignal).toBe('fail');
  });

  it('maps non-pass/fail status to unknown auth signal', () => {
    expect(mapUnknownSignal).toBe('unknown');
  });

  it('maps authenticate result spf status to relay auth signal', () => {
    expect(mappedSignalsSpf).toBe('pass');
  });

  it('maps authenticate result dkim status array to relay auth signal', () => {
    expect(mappedSignalsDkim).toBe('pass');
  });

  it('maps authenticate result dmarc status to relay auth signal', () => {
    expect(mappedSignalsDmarc).toBe('fail');
  });

  it('evaluates relay auth signals using injected authenticate implementation', () => {
    expect([evaluatedSignalsSpf, evaluatedSignalsDkim, evaluatedSignalsDmarc]).toEqual(['pass', 'fail', 'unknown']);
  });
});
