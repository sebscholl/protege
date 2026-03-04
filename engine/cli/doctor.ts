import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readGatewayRuntimeConfig, resolveDefaultGatewayConfigPath } from '@engine/gateway/index';
import { emitCliOutput } from '@engine/cli/output';
import { readInferenceRuntimeConfig } from '@engine/harness/config';
import { resolveSelectedProviderRuntimeConfig } from '@engine/harness/providers/registry';
import {
  isValidEmailAddress,
  readEmailAddressDomain,
} from '@engine/shared/email';
import {
  listPersonas,
  resolveDefaultPersonaRoots,
  resolvePersonaMemoryDirPath,
} from '@engine/shared/personas';
import { readGlobalRuntimeConfig, resolveDefaultGlobalConfigPath } from '@engine/shared/runtime-config';

/**
 * Represents one doctor check outcome item.
 */
export type DoctorCheckResult = {
  id: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  hint?: string;
};

/**
 * Represents the complete doctor report payload.
 */
export type DoctorReport = {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: DoctorCheckResult[];
};

/**
 * Parses `protege doctor` flags.
 */
export function parseDoctorArgs(
  args: {
    argv: string[];
  },
): {
  json: boolean;
} {
  return {
    json: args.argv.includes('--json'),
  };
}

/**
 * Runs all doctor checks and returns one aggregated report.
 */
export function runDoctorChecks(): DoctorReport {
  const checks: DoctorCheckResult[] = [];
  checks.push(checkGatewayConfigReadableAndValid());
  checks.push(checkPersonasExist());
  checks.push(checkMemoryPathsWritable());
  checks.push(checkGatewayPidStaleOrValid());
  checks.push(checkProviderConfigPresent());
  checks.push(checkRelayConfigValidWhenEnabled());
  checks.push(checkRelayPersonaAddressDomains());
  checks.push(checkExtensionsManifestReadable());
  checks.push(checkAdminContactEmailConfigured());
  return {
    status: summarizeDoctorStatus({
      checks,
    }),
    checks,
  };
}

/**
 * Verifies persona sender domains align with gateway mail domain when relay mode is enabled.
 */
export function checkRelayPersonaAddressDomains(): DoctorCheckResult {
  try {
    const gateway = readGatewayRuntimeConfig({
      configPath: resolveDefaultGatewayConfigPath(),
    });
    if (!gateway.relay?.enabled) {
      return {
        id: 'relay.persona_sender_domains_consistent',
        status: 'pass',
        message: 'relay mode is disabled.',
      };
    }

    const personas = listPersonas();
    for (const persona of personas) {
      if (!isValidEmailAddress({ value: persona.emailAddress })) {
        return {
          id: 'relay.persona_sender_domains_consistent',
          status: 'fail',
          message: `persona ${persona.personaId} has invalid emailAddress.`,
          hint: 'Run `protege relay bootstrap` to reconcile persona email domains.',
        };
      }

      const personaDomain = readEmailAddressDomain({ emailAddress: persona.emailAddress });
      if (personaDomain !== gateway.mailDomain) {
        return {
          id: 'relay.persona_sender_domains_consistent',
          status: 'fail',
          message: `persona ${persona.personaId} email domain mismatch (${personaDomain} != ${gateway.mailDomain}).`,
          hint: 'Run `protege relay bootstrap` to reconcile persona email domains.',
        };
      }
    }

    return {
      id: 'relay.persona_sender_domains_consistent',
      status: 'pass',
      message: 'persona sender domains align with relay mail domain.',
    };
  } catch (error) {
    return {
      id: 'relay.persona_sender_domains_consistent',
      status: 'fail',
      message: (error as Error).message,
      hint: 'Fix config/gateway.json and persona metadata.',
    };
  }
}

/**
 * Executes `protege doctor` and prints result in JSON or readable output.
 */
export function runDoctorCommand(
  args: {
    argv: string[];
  },
): void {
  const parsed = parseDoctorArgs({
    argv: args.argv,
  });
  const report = runDoctorChecks();
  emitCliOutput({
    mode: parsed.json ? 'json' : 'pretty',
    jsonValue: report,
    prettyText: renderDoctorReport({
      report,
    }),
  });

  process.exitCode = report.status === 'unhealthy' ? 1 : 0;
}

/**
 * Renders one doctor report as readable lines.
 */
export function renderDoctorReport(
  args: {
    report: DoctorReport;
  },
): string {
  const lines = [`status: ${args.report.status}`];
  for (const check of args.report.checks) {
    lines.push(`[${check.status}] ${check.id}: ${check.message}`);
    if (check.hint) {
      lines.push(`hint: ${check.hint}`);
    }
  }

  return lines.join('\n');
}

/**
 * Calculates overall doctor status from check-level pass/warn/fail signals.
 */
export function summarizeDoctorStatus(
  args: {
    checks: DoctorCheckResult[];
  },
): 'healthy' | 'degraded' | 'unhealthy' {
  if (args.checks.some((check) => check.status === 'fail')) {
    return 'unhealthy';
  }
  if (args.checks.some((check) => check.status === 'warn')) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Verifies gateway config can be loaded and validated.
 */
export function checkGatewayConfigReadableAndValid(): DoctorCheckResult {
  try {
    readGatewayRuntimeConfig({
      configPath: resolveDefaultGatewayConfigPath(),
    });
    return {
      id: 'config.gateway.readable_and_valid',
      status: 'pass',
      message: 'gateway config is readable and valid.',
    };
  } catch (error) {
    return {
      id: 'config.gateway.readable_and_valid',
      status: 'fail',
      message: (error as Error).message,
      hint: 'Fix config/gateway.json format and required fields.',
    };
  }
}

/**
 * Verifies at least one persona exists on disk.
 */
export function checkPersonasExist(): DoctorCheckResult {
  const personas = listPersonas();
  if (personas.length > 0) {
    return {
      id: 'personas.exists',
      status: 'pass',
      message: `found ${personas.length} persona(s).`,
    };
  }

  return {
    id: 'personas.exists',
    status: 'fail',
    message: 'no personas found.',
    hint: 'Run `protege persona create --name "Primary"`.',
  };
}

/**
 * Verifies memory roots and persona namespaces are writable.
 */
export function checkMemoryPathsWritable(): DoctorCheckResult {
  try {
    const roots = resolveDefaultPersonaRoots();
    accessSync(roots.memoryDirPath, constants.W_OK);
    const personas = listPersonas();
    if (personas.length === 0) {
      return {
        id: 'memory.paths.writable',
        status: 'warn',
        message: 'memory root is writable but no personas exist yet.',
        hint: 'Create a persona to validate persona-specific memory paths.',
      };
    }

    for (const persona of personas) {
      const personaMemoryDirPath = resolvePersonaMemoryDirPath({
        personaId: persona.personaId,
      });
      accessSync(personaMemoryDirPath, constants.W_OK);
    }

    return {
      id: 'memory.paths.writable',
      status: 'pass',
      message: 'memory paths are writable.',
    };
  } catch (error) {
    return {
      id: 'memory.paths.writable',
      status: 'fail',
      message: (error as Error).message,
      hint: 'Ensure memory directories exist and are writable.',
    };
  }
}

/**
 * Verifies gateway pid state is either missing, valid, or marked stale.
 */
export function checkGatewayPidStaleOrValid(): DoctorCheckResult {
  const pidFilePath = join(process.cwd(), 'tmp', 'gateway.pid');
  if (!existsSync(pidFilePath)) {
    return {
      id: 'gateway.pid_stale_or_valid',
      status: 'pass',
      message: 'gateway pid file is absent.',
    };
  }

  const pidText = readFileSync(pidFilePath, 'utf8').trim();
  const pid = Number(pidText);
  if (!Number.isInteger(pid) || pid <= 0) {
    return {
      id: 'gateway.pid_stale_or_valid',
      status: 'warn',
      message: 'gateway pid file is invalid.',
      hint: 'Run `protege gateway stop` to clean stale pid state.',
    };
  }

  try {
    process.kill(pid, 0);
    return {
      id: 'gateway.pid_stale_or_valid',
      status: 'pass',
      message: `gateway process ${pid} appears alive.`,
    };
  } catch {
    return {
      id: 'gateway.pid_stale_or_valid',
      status: 'warn',
      message: `gateway pid ${pid} is stale.`,
      hint: 'Run `protege gateway stop` to clean stale pid state.',
    };
  }
}

/**
 * Verifies selected inference provider has required local credentials.
 */
export function checkProviderConfigPresent(): DoctorCheckResult {
  try {
    const config = readInferenceRuntimeConfig();
    const providerRuntimeConfig = resolveSelectedProviderRuntimeConfig({
      provider: config.provider,
    });
    if (providerRuntimeConfig.apiKey) {
      return {
        id: 'provider.config_present_for_selected_provider',
        status: 'pass',
        message: 'selected provider credentials are configured.',
      };
    }

    return {
      id: 'provider.config_present_for_selected_provider',
      status: 'fail',
      message: `missing credentials for selected provider ${config.provider}.`,
      hint: 'Set providers[].config.api_key_env in extensions/extensions.json and ensure the env var is set.',
    };
  } catch (error) {
    return {
      id: 'provider.config_present_for_selected_provider',
      status: 'fail',
      message: (error as Error).message,
      hint: 'Ensure config/inference.json is readable and valid.',
    };
  }
}

/**
 * Verifies relay config block remains valid when relay mode is enabled.
 */
export function checkRelayConfigValidWhenEnabled(): DoctorCheckResult {
  try {
    const gateway = readGatewayRuntimeConfig({
      configPath: resolveDefaultGatewayConfigPath(),
    });
    if (!gateway.relay?.enabled) {
      return {
        id: 'relay.config_valid_when_enabled',
        status: 'pass',
        message: 'relay mode is disabled.',
      };
    }

    return {
      id: 'relay.config_valid_when_enabled',
      status: 'pass',
      message: 'relay mode is enabled and config is valid.',
    };
  } catch (error) {
    return {
      id: 'relay.config_valid_when_enabled',
      status: 'fail',
      message: (error as Error).message,
      hint: 'Fix config/gateway.json relay fields.',
    };
  }
}

/**
 * Verifies extensions manifest is readable and parseable.
 */
export function checkExtensionsManifestReadable(): DoctorCheckResult {
  const manifestPath = join(process.cwd(), 'extensions', 'extensions.json');
  if (!existsSync(manifestPath)) {
    return {
      id: 'extensions.manifest.readable',
      status: 'fail',
      message: 'extensions manifest not found.',
      hint: 'Create extensions/extensions.json.',
    };
  }

  try {
    JSON.parse(readFileSync(manifestPath, 'utf8'));
    return {
      id: 'extensions.manifest.readable',
      status: 'pass',
      message: 'extensions manifest is readable.',
    };
  } catch (error) {
    return {
      id: 'extensions.manifest.readable',
      status: 'fail',
      message: (error as Error).message,
      hint: 'Fix extensions/extensions.json syntax.',
    };
  }
}

/**
 * Verifies global admin contact email is configured and valid for runtime failure alerts.
 */
export function checkAdminContactEmailConfigured(): DoctorCheckResult {
  const configPath = resolveDefaultGlobalConfigPath();
  if (!existsSync(configPath)) {
    return {
      id: 'scheduler.admin_contact_email_configured',
      status: 'warn',
      message: 'system config not found; runtime failure alerts are disabled.',
      hint: 'Create config/system.json with admin_contact_email.',
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    const topLevelValue = parsed.admin_contact_email;
    const scheduler = parsed.scheduler;
    const schedulerValue = scheduler && typeof scheduler === 'object' && !Array.isArray(scheduler)
      ? (scheduler as Record<string, unknown>).admin_contact_email
      : undefined;
    const value = topLevelValue ?? schedulerValue;

    if (value === undefined || (typeof value === 'string' && value.trim().length === 0)) {
      return {
        id: 'scheduler.admin_contact_email_configured',
        status: 'warn',
        message: 'admin_contact_email is missing; runtime failure alerts will be logged only.',
        hint: 'Set admin_contact_email in config/system.json.',
      };
    }
    if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      return {
        id: 'scheduler.admin_contact_email_configured',
        status: 'fail',
        message: 'admin_contact_email is invalid.',
        hint: 'Set admin_contact_email to a valid email address.',
      };
    }

    return {
      id: 'scheduler.admin_contact_email_configured',
      status: 'pass',
      message: 'runtime admin contact email is configured.',
    };
  } catch (error) {
    return {
      id: 'scheduler.admin_contact_email_configured',
      status: 'fail',
      message: (error as Error).message,
      hint: 'Fix config/system.json syntax.',
    };
  }
}

/**
 * Reads global runtime config once to ensure system config remains parseable.
 */
export function validateGlobalConfigReadable(): void {
  void readGlobalRuntimeConfig();
}
