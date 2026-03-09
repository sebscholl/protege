import type { SMTPServerSession } from 'smtp-server';
import type { AuthenticateResult } from 'mailauth';
import type { RelayAuthSignals } from '@relay/src/shared/relay-auth-attestation';

type MailauthAuthenticateFn = (
  input: Buffer,
  options: Record<string, unknown>,
) => Promise<AuthenticateResult>;

let cachedMailauthAuthenticateFn: MailauthAuthenticateFn | undefined;

/**
 * Ensures one global File constructor exists before loading mailauth/undici on older Node runtimes.
 */
export async function ensureGlobalFileCtor(): Promise<void> {
  if (typeof globalThis.File === 'function') {
    return;
  }
  const bufferModule = await import('node:buffer');
  if (typeof bufferModule.File === 'function') {
    globalThis.File = bufferModule.File as unknown as typeof globalThis.File;
  }
}

/**
 * Loads and memoizes one mailauth authenticate function.
 */
export async function loadMailauthAuthenticateFn(): Promise<MailauthAuthenticateFn> {
  if (cachedMailauthAuthenticateFn) {
    return cachedMailauthAuthenticateFn;
  }
  await ensureGlobalFileCtor();
  const mailauthModule = await import('mailauth');
  cachedMailauthAuthenticateFn = mailauthModule.authenticate as MailauthAuthenticateFn;
  return cachedMailauthAuthenticateFn;
}

/**
 * Maps one mailauth status result token into relay auth signal representation.
 */
export function mapMailauthStatusToSignal(
  args: {
    statusResult: string | undefined;
  },
): 'pass' | 'fail' | 'unknown' {
  const statusResult = typeof args.statusResult === 'string'
    ? args.statusResult.toLowerCase()
    : '';
  if (statusResult === 'pass') {
    return 'pass';
  }
  if (['fail', 'permerror', 'temperror', 'temperr', 'softfail', 'policy'].includes(statusResult)) {
    return 'fail';
  }

  return 'unknown';
}

/**
 * Maps one mailauth authenticate() result object into normalized relay auth signals.
 */
export function toRelayAuthSignalsFromAuthenticateResult(
  args: {
    result: AuthenticateResult;
  },
): RelayAuthSignals {
  const spfSignal = args.result.spf
    ? mapMailauthStatusToSignal({
      statusResult: args.result.spf.status?.result,
    })
    : 'unknown';

  const dmarcSignal = args.result.dmarc
    ? mapMailauthStatusToSignal({
      statusResult: args.result.dmarc.status?.result,
    })
    : 'unknown';

  const dkimResults = Array.isArray(args.result.dkim?.results)
    ? args.result.dkim.results
    : [];
  const hasDkimPass = dkimResults.some((item) => item.status?.result === 'pass');
  const hasDkimFailure = dkimResults.some((item) => mapMailauthStatusToSignal({
    statusResult: item.status?.result,
  }) === 'fail');
  const dkimSignal = hasDkimPass
    ? 'pass'
    : (hasDkimFailure ? 'fail' : 'unknown');

  return {
    spf: spfSignal,
    dkim: dkimSignal,
    dmarc: dmarcSignal,
  };
}

/**
 * Evaluates SPF/DKIM/DMARC for one relay SMTP ingress message.
 */
export async function evaluateRelayAuthSignals(
  args: {
    rawMimeBuffer: Buffer;
    session: SMTPServerSession;
    mailFrom: string;
    mtaHostname?: string;
    authenticateFn?: MailauthAuthenticateFn;
  },
): Promise<RelayAuthSignals> {
  const remoteAddress = readRelaySmtpRemoteAddress({
    session: args.session,
  });
  if (remoteAddress.length === 0) {
    return {
      spf: 'unknown',
      dkim: 'unknown',
      dmarc: 'unknown',
    };
  }

  const authenticateFn = args.authenticateFn ?? await loadMailauthAuthenticateFn();
  try {
    const result = await authenticateFn(args.rawMimeBuffer, {
      sender: args.mailFrom,
      ip: remoteAddress,
      helo: readRelaySmtpHelo({
        session: args.session,
      }),
      mta: args.mtaHostname,
      trustReceived: false,
      disableArc: true,
      disableBimi: true,
    });
    return toRelayAuthSignalsFromAuthenticateResult({
      result,
    });
  } catch {
    return {
      spf: 'unknown',
      dkim: 'unknown',
      dmarc: 'unknown',
    };
  }
}

/**
 * Reads one normalized SMTP client IP address from session payload.
 */
export function readRelaySmtpRemoteAddress(
  args: {
    session: SMTPServerSession;
  },
): string {
  const remoteAddress = args.session.remoteAddress;
  return typeof remoteAddress === 'string' && remoteAddress.trim().length > 0
    ? remoteAddress.trim()
    : '';
}

/**
 * Reads one SMTP HELO/EHLO hostname from session payload when available.
 */
export function readRelaySmtpHelo(
  args: {
    session: SMTPServerSession;
  },
): string | undefined {
  const hostNameAppearsAs = (args.session as unknown as { hostNameAppearsAs?: unknown }).hostNameAppearsAs;
  if (typeof hostNameAppearsAs === 'string' && hostNameAppearsAs.trim().length > 0) {
    return hostNameAppearsAs.trim();
  }

  const clientHostname = (args.session as unknown as { clientHostname?: unknown }).clientHostname;
  return typeof clientHostname === 'string' && clientHostname.trim().length > 0
    ? clientHostname.trim()
    : undefined;
}
