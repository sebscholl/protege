import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/**
 * Represents one relay runtime configuration.
 */
export type RelayRuntimeConfig = {
  host: string;
  port: number;
  logging: {
    consoleLogFormat: 'json' | 'pretty';
    prettyLogThemePath: string;
  };
  smtp: {
    enabled: boolean;
    host: string;
    port: number;
    maxMessageBytes: number;
    maxRecipients: number;
  };
  rateLimits: {
    smtpConnectionsPerMinutePerIp: number;
    smtpMessagesPerMinutePerIp: number;
    wsAuthAttemptsPerMinutePerIp: number;
    denyWindowMs: number;
  };
  auth: {
    challengeTtlSeconds: number;
    maxChallengeRecords: number;
    challengeGcIntervalMs: number;
  };
  ws: {
    heartbeatIntervalMs: number;
    idleTimeoutMs: number;
  };
  dkim: {
    enabled: boolean;
    domainName: string;
    keySelector: string;
    privateKeyPath: string;
    privateKey: string;
    headerFieldNames: string;
    skipFields: string;
  };
  attestation: {
    enabled: boolean;
    keyId: string;
    signingPrivateKeyPath: string;
    signingPrivateKeyPem: string;
  };
};

/**
 * Resolves default relay config path under relay directory.
 */
export function resolveDefaultRelayConfigPath(): string {
  return join(process.cwd(), 'relay', 'config.json');
}

/**
 * Reads relay runtime config from disk with fallback defaults.
 */
export function readRelayRuntimeConfig(
  args: {
    configPath?: string;
  } = {},
): RelayRuntimeConfig {
  const configPath = args.configPath ?? resolveDefaultRelayConfigPath();
  if (!existsSync(configPath)) {
    return {
      host: '127.0.0.1',
      port: 8080,
      logging: {
        consoleLogFormat: 'json',
        prettyLogThemePath: join(process.cwd(), 'relay', 'theme.json'),
      },
      smtp: {
        enabled: true,
        host: '127.0.0.1',
        port: 2526,
        maxMessageBytes: 10 * 1024 * 1024,
        maxRecipients: 1,
      },
      rateLimits: {
        smtpConnectionsPerMinutePerIp: 60,
        smtpMessagesPerMinutePerIp: 30,
        wsAuthAttemptsPerMinutePerIp: 20,
        denyWindowMs: 5 * 60 * 1000,
      },
      auth: {
        challengeTtlSeconds: 60,
        maxChallengeRecords: 10_000,
        challengeGcIntervalMs: 60 * 1000,
      },
      ws: {
        heartbeatIntervalMs: 30 * 1000,
        idleTimeoutMs: 120 * 1000,
      },
      dkim: {
        enabled: false,
        domainName: '',
        keySelector: '',
        privateKeyPath: '',
        privateKey: '',
        headerFieldNames: 'from:sender:reply-to:subject:date:message-id:to:cc:mime-version:content-type:content-transfer-encoding',
        skipFields: 'message-id:date',
      },
      attestation: {
        enabled: false,
        keyId: '',
        signingPrivateKeyPath: '',
        signingPrivateKeyPem: '',
      },
    };
  }

  const text = readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(text) as unknown;
  return validateRelayRuntimeConfig({
    parsed,
    configPath,
  });
}

/**
 * Validates parsed relay runtime config and returns normalized values.
 */
export function validateRelayRuntimeConfig(
  args: {
    parsed: unknown;
    configPath: string;
  },
): RelayRuntimeConfig {
  if (!isRecord({
    value: args.parsed,
  })) {
    throw new Error(`Relay config at ${args.configPath} must be a JSON object.`);
  }
  const parsed = args.parsed as Record<string, unknown>;

  const host = readNonEmptyString({
    value: parsed.host,
    fieldPath: 'host',
    configPath: args.configPath,
  });
  const port = readPort({
    value: parsed.port,
    fieldPath: 'port',
    configPath: args.configPath,
  });
  if (!isRecord({
    value: parsed.logging,
  })) {
    throw new Error(`Relay config at ${args.configPath} field logging must be an object.`);
  }
  const logging = parsed.logging as Record<string, unknown>;
  if (!isRecord({
    value: parsed.smtp,
  })) {
    throw new Error(`Relay config at ${args.configPath} field smtp must be an object.`);
  }
  const smtp = parsed.smtp as Record<string, unknown>;
  if (!isRecord({
    value: parsed.rateLimits,
  })) {
    throw new Error(`Relay config at ${args.configPath} field rateLimits must be an object.`);
  }
  const rateLimits = parsed.rateLimits as Record<string, unknown>;
  if (!isRecord({
    value: parsed.auth,
  })) {
    throw new Error(`Relay config at ${args.configPath} field auth must be an object.`);
  }
  const auth = parsed.auth as Record<string, unknown>;
  if (!isRecord({
    value: parsed.ws,
  })) {
    throw new Error(`Relay config at ${args.configPath} field ws must be an object.`);
  }
  if (
    parsed.dkim !== undefined
    && !isRecord({
      value: parsed.dkim,
    })
  ) {
    throw new Error(`Relay config at ${args.configPath} field dkim must be an object when provided.`);
  }
  if (
    parsed.attestation !== undefined
    && !isRecord({
      value: parsed.attestation,
    })
  ) {
    throw new Error(`Relay config at ${args.configPath} field attestation must be an object when provided.`);
  }
  const ws = parsed.ws as Record<string, unknown>;
  const dkim = (parsed.dkim as Record<string, unknown> | undefined) ?? {};
  const attestation = (parsed.attestation as Record<string, unknown> | undefined) ?? {};
  const dkimEnabled = readBooleanWithDefault({
    value: dkim.enabled,
    fallback: false,
    fieldPath: 'dkim.enabled',
    configPath: args.configPath,
  });
  const dkimDomainName = readStringWithDefault({
    value: dkim.domainName,
    fallback: '',
    fieldPath: 'dkim.domainName',
    configPath: args.configPath,
  });
  const dkimKeySelector = readStringWithDefault({
    value: dkim.keySelector,
    fallback: '',
    fieldPath: 'dkim.keySelector',
    configPath: args.configPath,
  });
  const dkimPrivateKeyPath = readStringWithDefault({
    value: dkim.privateKeyPath,
    fallback: '',
    fieldPath: 'dkim.privateKeyPath',
    configPath: args.configPath,
  });
  const dkimHeaderFieldNames = readStringWithDefault({
    value: dkim.headerFieldNames,
    fallback: 'from:sender:reply-to:subject:date:message-id:to:cc:mime-version:content-type:content-transfer-encoding',
    fieldPath: 'dkim.headerFieldNames',
    configPath: args.configPath,
  });
  const dkimSkipFields = readStringWithDefault({
    value: dkim.skipFields,
    fallback: 'message-id:date',
    fieldPath: 'dkim.skipFields',
    configPath: args.configPath,
  });
  const dkimPrivateKey = readRelayDkimPrivateKey({
    enabled: dkimEnabled,
    domainName: dkimDomainName,
    keySelector: dkimKeySelector,
    privateKeyPath: dkimPrivateKeyPath,
    configPath: args.configPath,
  });
  const attestationEnabled = readBooleanWithDefault({
    value: attestation.enabled,
    fallback: false,
    fieldPath: 'attestation.enabled',
    configPath: args.configPath,
  });
  const attestationKeyId = readStringWithDefault({
    value: attestation.keyId,
    fallback: '',
    fieldPath: 'attestation.keyId',
    configPath: args.configPath,
  });
  const attestationSigningPrivateKeyPath = readStringWithDefault({
    value: attestation.signingPrivateKeyPath,
    fallback: '',
    fieldPath: 'attestation.signingPrivateKeyPath',
    configPath: args.configPath,
  });
  const attestationSigningPrivateKeyPem = readRelayAttestationPrivateKey({
    enabled: attestationEnabled,
    keyId: attestationKeyId,
    signingPrivateKeyPath: attestationSigningPrivateKeyPath,
    configPath: args.configPath,
  });

  return {
    host,
    port,
    logging: {
      consoleLogFormat: readRelayConsoleLogFormat({
        value: logging.consoleLogFormat,
        fieldPath: 'logging.consoleLogFormat',
        configPath: args.configPath,
      }),
      prettyLogThemePath: readNonEmptyString({
        value: logging.prettyLogThemePath,
        fieldPath: 'logging.prettyLogThemePath',
        configPath: args.configPath,
      }),
    },
    smtp: {
      enabled: readBoolean({
        value: smtp.enabled,
        fieldPath: 'smtp.enabled',
        configPath: args.configPath,
      }),
      host: readNonEmptyString({
        value: smtp.host,
        fieldPath: 'smtp.host',
        configPath: args.configPath,
      }),
      port: readPort({
        value: smtp.port,
        fieldPath: 'smtp.port',
        configPath: args.configPath,
      }),
      maxMessageBytes: readPositiveInteger({
        value: smtp.maxMessageBytes,
        fieldPath: 'smtp.maxMessageBytes',
        configPath: args.configPath,
      }),
      maxRecipients: readPositiveInteger({
        value: smtp.maxRecipients,
        fieldPath: 'smtp.maxRecipients',
        configPath: args.configPath,
      }),
    },
    rateLimits: {
      smtpConnectionsPerMinutePerIp: readPositiveInteger({
        value: rateLimits.smtpConnectionsPerMinutePerIp,
        fieldPath: 'rateLimits.smtpConnectionsPerMinutePerIp',
        configPath: args.configPath,
      }),
      smtpMessagesPerMinutePerIp: readPositiveInteger({
        value: rateLimits.smtpMessagesPerMinutePerIp,
        fieldPath: 'rateLimits.smtpMessagesPerMinutePerIp',
        configPath: args.configPath,
      }),
      wsAuthAttemptsPerMinutePerIp: readPositiveInteger({
        value: rateLimits.wsAuthAttemptsPerMinutePerIp,
        fieldPath: 'rateLimits.wsAuthAttemptsPerMinutePerIp',
        configPath: args.configPath,
      }),
      denyWindowMs: readPositiveInteger({
        value: rateLimits.denyWindowMs,
        fieldPath: 'rateLimits.denyWindowMs',
        configPath: args.configPath,
      }),
    },
    auth: {
      challengeTtlSeconds: readPositiveInteger({
        value: auth.challengeTtlSeconds,
        fieldPath: 'auth.challengeTtlSeconds',
        configPath: args.configPath,
      }),
      maxChallengeRecords: readPositiveInteger({
        value: auth.maxChallengeRecords,
        fieldPath: 'auth.maxChallengeRecords',
        configPath: args.configPath,
      }),
      challengeGcIntervalMs: readPositiveInteger({
        value: auth.challengeGcIntervalMs,
        fieldPath: 'auth.challengeGcIntervalMs',
        configPath: args.configPath,
      }),
    },
    ws: {
      heartbeatIntervalMs: readPositiveInteger({
        value: ws.heartbeatIntervalMs,
        fieldPath: 'ws.heartbeatIntervalMs',
        configPath: args.configPath,
      }),
      idleTimeoutMs: readPositiveInteger({
        value: ws.idleTimeoutMs,
        fieldPath: 'ws.idleTimeoutMs',
        configPath: args.configPath,
      }),
    },
    dkim: {
      enabled: dkimEnabled,
      domainName: dkimDomainName,
      keySelector: dkimKeySelector,
      privateKeyPath: dkimPrivateKeyPath,
      privateKey: dkimPrivateKey,
      headerFieldNames: dkimHeaderFieldNames,
      skipFields: dkimSkipFields,
    },
    attestation: {
      enabled: attestationEnabled,
      keyId: attestationKeyId,
      signingPrivateKeyPath: attestationSigningPrivateKeyPath,
      signingPrivateKeyPem: attestationSigningPrivateKeyPem,
    },
  };
}

/**
 * Reads one relay DKIM private key from disk when DKIM signing is enabled.
 */
export function readRelayDkimPrivateKey(
  args: {
    enabled: boolean;
    domainName: string;
    keySelector: string;
    privateKeyPath: string;
    configPath: string;
  },
): string {
  if (!args.enabled) {
    return '';
  }

  if (args.domainName.trim().length === 0) {
    throw new Error(`Relay config at ${args.configPath} field dkim.domainName must be a non-empty string when dkim.enabled is true.`);
  }
  if (args.keySelector.trim().length === 0) {
    throw new Error(`Relay config at ${args.configPath} field dkim.keySelector must be a non-empty string when dkim.enabled is true.`);
  }
  if (args.privateKeyPath.trim().length === 0) {
    throw new Error(`Relay config at ${args.configPath} field dkim.privateKeyPath must be a non-empty string when dkim.enabled is true.`);
  }

  const resolvedPrivateKeyPath = isAbsolute(args.privateKeyPath)
    ? args.privateKeyPath
    : resolve(dirname(args.configPath), args.privateKeyPath);
  if (!existsSync(resolvedPrivateKeyPath)) {
    throw new Error(`Relay config at ${args.configPath} references missing dkim.privateKeyPath: ${resolvedPrivateKeyPath}`);
  }

  const privateKey = readFileSync(resolvedPrivateKeyPath, 'utf8').trim();
  if (privateKey.length === 0) {
    throw new Error(`Relay config at ${args.configPath} references empty dkim.privateKeyPath: ${resolvedPrivateKeyPath}`);
  }
  return privateKey;
}

/**
 * Reads one relay attestation signing key from disk when attestation is enabled.
 */
export function readRelayAttestationPrivateKey(
  args: {
    enabled: boolean;
    keyId: string;
    signingPrivateKeyPath: string;
    configPath: string;
  },
): string {
  if (!args.enabled) {
    return '';
  }

  if (args.keyId.trim().length === 0) {
    throw new Error(`Relay config at ${args.configPath} field attestation.keyId must be a non-empty string when attestation.enabled is true.`);
  }
  if (args.signingPrivateKeyPath.trim().length === 0) {
    throw new Error(`Relay config at ${args.configPath} field attestation.signingPrivateKeyPath must be a non-empty string when attestation.enabled is true.`);
  }

  const resolvedPrivateKeyPath = isAbsolute(args.signingPrivateKeyPath)
    ? args.signingPrivateKeyPath
    : resolve(dirname(args.configPath), args.signingPrivateKeyPath);
  if (!existsSync(resolvedPrivateKeyPath)) {
    throw new Error(`Relay config at ${args.configPath} references missing attestation.signingPrivateKeyPath: ${resolvedPrivateKeyPath}`);
  }

  const privateKeyPem = readFileSync(resolvedPrivateKeyPath, 'utf8').trim();
  if (privateKeyPem.length === 0) {
    throw new Error(`Relay config at ${args.configPath} references empty attestation.signingPrivateKeyPath: ${resolvedPrivateKeyPath}`);
  }
  return privateKeyPem;
}

/**
 * Reads one relay console log format value.
 */
export function readRelayConsoleLogFormat(
  args: {
    value: unknown;
    fieldPath: string;
    configPath: string;
  },
): 'json' | 'pretty' {
  if (args.value === 'json' || args.value === 'pretty') {
    return args.value;
  }

  throw new Error(
    `Relay config at ${args.configPath} field ${args.fieldPath} must be "json" or "pretty".`,
  );
}

/**
 * Returns true when one unknown value is a non-null object record.
 */
export function isRecord(
  args: {
    value: unknown;
  },
): boolean {
  return typeof args.value === 'object' && args.value !== null && !Array.isArray(args.value);
}

/**
 * Reads one required non-empty string config value.
 */
export function readNonEmptyString(
  args: {
    value: unknown;
    fieldPath: string;
    configPath: string;
  },
): string {
  if (typeof args.value !== 'string' || args.value.trim().length === 0) {
    throw new Error(`Relay config at ${args.configPath} field ${args.fieldPath} must be a non-empty string.`);
  }

  return args.value;
}

/**
 * Reads one required boolean config value.
 */
export function readBoolean(
  args: {
    value: unknown;
    fieldPath: string;
    configPath: string;
  },
): boolean {
  if (typeof args.value !== 'boolean') {
    throw new Error(`Relay config at ${args.configPath} field ${args.fieldPath} must be a boolean.`);
  }

  return args.value;
}

/**
 * Reads one optional boolean config value with fallback.
 */
export function readBooleanWithDefault(
  args: {
    value: unknown;
    fallback: boolean;
    fieldPath: string;
    configPath: string;
  },
): boolean {
  if (args.value === undefined) {
    return args.fallback;
  }

  return readBoolean({
    value: args.value,
    fieldPath: args.fieldPath,
    configPath: args.configPath,
  });
}

/**
 * Reads one optional string config value with fallback.
 */
export function readStringWithDefault(
  args: {
    value: unknown;
    fallback: string;
    fieldPath: string;
    configPath: string;
  },
): string {
  if (args.value === undefined) {
    return args.fallback;
  }
  if (typeof args.value !== 'string') {
    throw new Error(`Relay config at ${args.configPath} field ${args.fieldPath} must be a string.`);
  }
  return args.value;
}

/**
 * Reads one required positive integer config value.
 */
export function readPositiveInteger(
  args: {
    value: unknown;
    fieldPath: string;
    configPath: string;
  },
): number {
  if (!Number.isInteger(args.value) || (args.value as number) <= 0) {
    throw new Error(`Relay config at ${args.configPath} field ${args.fieldPath} must be a positive integer.`);
  }

  return args.value as number;
}

/**
 * Reads one required TCP port within standard range.
 */
export function readPort(
  args: {
    value: unknown;
    fieldPath: string;
    configPath: string;
  },
): number {
  const port = readPositiveInteger(args);
  if (port < 1 || port > 65535) {
    throw new Error(`Relay config at ${args.configPath} field ${args.fieldPath} must be within 1-65535.`);
  }

  return port;
}
