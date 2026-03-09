import { createHash, sign, verify } from 'node:crypto';

/**
 * Represents one normalized relay sender-auth signal set.
 */
export type RelayAuthSignals = {
  spf: 'pass' | 'fail' | 'unknown';
  dkim: 'pass' | 'fail' | 'unknown';
  dmarc: 'pass' | 'fail' | 'unknown';
};

/**
 * Represents one relay auth attestation payload.
 */
export type RelayAuthAttestationPayload = {
  streamId: string;
  mailFrom: string;
  rcptTo: string;
  issuedAt: string;
  signals: RelayAuthSignals;
};

/**
 * Represents one signed relay auth attestation envelope.
 */
export type RelayAuthAttestation = {
  keyId: string;
  payloadBase64: string;
  signatureBase64: string;
};

/**
 * Represents one relay attestation verification result.
 */
export type RelayAuthAttestationVerification = {
  valid: boolean;
  reason:
    | 'missing_attestation'
    | 'missing_trusted_key'
    | 'invalid_payload'
    | 'invalid_signature'
    | 'context_mismatch'
    | 'ok';
  payload?: RelayAuthAttestationPayload;
};

/**
 * Creates one signed relay auth attestation envelope.
 */
export function createRelayAuthAttestation(
  args: {
    keyId: string;
    privateKeyPem: string;
    payload: RelayAuthAttestationPayload;
  },
): RelayAuthAttestation {
  const payloadJson = toRelayAuthAttestationPayloadJson({
    payload: args.payload,
  });
  const payloadBuffer = Buffer.from(payloadJson, 'utf8');
  const signature = sign(null, payloadBuffer, args.privateKeyPem);
  return {
    keyId: args.keyId,
    payloadBase64: payloadBuffer.toString('base64'),
    signatureBase64: signature.toString('base64'),
  };
}

/**
 * Verifies one relay auth attestation against trusted relay public keys and expected frame context.
 */
export function verifyRelayAuthAttestation(
  args: {
    attestation?: RelayAuthAttestation;
    trustedRelayPublicKeysByKeyId: Map<string, string>;
    expectedContext: {
      streamId: string;
      mailFrom: string;
      rcptTo: string;
    };
  },
): RelayAuthAttestationVerification {
  if (!args.attestation) {
    return {
      valid: false,
      reason: 'missing_attestation',
    };
  }

  const trustedPublicKeyPem = args.trustedRelayPublicKeysByKeyId.get(args.attestation.keyId);
  if (!trustedPublicKeyPem) {
    return {
      valid: false,
      reason: 'missing_trusted_key',
    };
  }

  const payloadBuffer = Buffer.from(args.attestation.payloadBase64, 'base64');
  let payload: RelayAuthAttestationPayload;
  try {
    payload = JSON.parse(payloadBuffer.toString('utf8')) as RelayAuthAttestationPayload;
  } catch {
    return {
      valid: false,
      reason: 'invalid_payload',
    };
  }

  const signatureValid = verify(
    null,
    payloadBuffer,
    trustedPublicKeyPem,
    Buffer.from(args.attestation.signatureBase64, 'base64'),
  );
  if (!signatureValid) {
    return {
      valid: false,
      reason: 'invalid_signature',
      payload,
    };
  }

  const contextDigest = hashRelayContext({
    streamId: args.expectedContext.streamId,
    mailFrom: args.expectedContext.mailFrom,
    rcptTo: args.expectedContext.rcptTo,
  });
  const payloadDigest = hashRelayContext({
    streamId: payload.streamId,
    mailFrom: payload.mailFrom,
    rcptTo: payload.rcptTo,
  });
  if (contextDigest !== payloadDigest) {
    return {
      valid: false,
      reason: 'context_mismatch',
      payload,
    };
  }

  return {
    valid: true,
    reason: 'ok',
    payload,
  };
}

/**
 * Serializes relay auth payload deterministically for signature generation and verification.
 */
export function toRelayAuthAttestationPayloadJson(
  args: {
    payload: RelayAuthAttestationPayload;
  },
): string {
  return JSON.stringify({
    streamId: args.payload.streamId,
    mailFrom: args.payload.mailFrom,
    rcptTo: args.payload.rcptTo,
    issuedAt: args.payload.issuedAt,
    signals: {
      spf: args.payload.signals.spf,
      dkim: args.payload.signals.dkim,
      dmarc: args.payload.signals.dmarc,
    },
  });
}

/**
 * Produces one deterministic context hash for relay attestation binding checks.
 */
export function hashRelayContext(
  args: {
    streamId: string;
    mailFrom: string;
    rcptTo: string;
  },
): string {
  return createHash('sha256')
    .update(`${args.streamId}\n${args.mailFrom}\n${args.rcptTo}`, 'utf8')
    .digest('hex');
}
