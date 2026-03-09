import type { CliOutputMode } from '@engine/cli/output';

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { emitCliOutput, emitCliText, renderCliKeyValueTable } from '@engine/cli/output';

/**
 * Represents one daemon management scope value.
 */
export type DaemonScope = 'user' | 'system';

/**
 * Represents one parsed daemon install/reinstall options payload.
 */
export type DaemonInstallOptions = {
  scope: DaemonScope;
  baseName: string;
  workspacePath: string;
  envFilePath: string;
  force: boolean;
  outputMode: CliOutputMode;
};

/**
 * Represents one parsed daemon unit target options payload.
 */
export type DaemonTargetOptions = {
  scope: DaemonScope;
  baseName: string;
  workspacePath: string;
  unitName?: string;
  outputMode: CliOutputMode;
};

/**
 * Represents one shell command invocation payload used by daemon CLI execution.
 */
export type DaemonShellCommand = {
  command: string;
  argv: string[];
  captureStdout?: boolean;
  suppressStderr?: boolean;
};

/**
 * Represents one dependency bag for daemon CLI runtime behavior.
 */
export type DaemonCliDeps = {
  platform: string;
  cwd: () => string;
  homeDir: () => string;
  existsSync: (
    path: string,
  ) => boolean;
  mkdirSync: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => void;
  writeFileSync: (
    path: string,
    value: string,
  ) => void;
  readFileSync: (
    path: string,
    encoding: BufferEncoding,
  ) => string;
  rmSync: (
    path: string,
    options?: {
      force?: boolean;
    },
  ) => void;
  runShellCommand: (
    command: DaemonShellCommand,
  ) => string;
  resolveProtegeBinaryPath: () => string;
  resolveNodeBinaryPath: () => string;
  resolveRealPath: (
    path: string,
  ) => string;
};

/**
 * Dispatches daemon-specific CLI subcommands.
 */
export function runDaemonCli(
  args: {
    argv: string[];
    deps?: DaemonCliDeps;
  },
): void {
  const deps = args.deps ?? createDefaultDaemonCliDeps();
  assertLinuxDaemonSupport({
    platform: deps.platform,
  });
  const [action, ...rest] = args.argv;
  if (!action) {
    throw new Error(getDaemonUsageText());
  }

  if (action === 'install') {
    installDaemon({
      options: parseDaemonInstallArgs({
        argv: rest,
        cwdPath: deps.cwd(),
      }),
      deps,
    });
    return;
  }

  if (action === 'reinstall') {
    reinstallDaemon({
      options: parseDaemonInstallArgs({
        argv: rest,
        cwdPath: deps.cwd(),
      }),
      deps,
    });
    return;
  }

  if (action === 'uninstall') {
    uninstallDaemon({
      options: parseDaemonTargetArgs({
        argv: rest,
        cwdPath: deps.cwd(),
      }),
      deps,
    });
    return;
  }

  if (action === 'start' || action === 'stop' || action === 'restart' || action === 'enable' || action === 'disable') {
    runSystemctlUnitAction({
      action,
      options: parseDaemonTargetArgs({
        argv: rest,
        cwdPath: deps.cwd(),
      }),
      deps,
    });
    return;
  }

  if (action === 'status') {
    showDaemonStatus({
      options: parseDaemonTargetArgs({
        argv: rest,
        cwdPath: deps.cwd(),
      }),
      deps,
    });
    return;
  }

  if (action === 'info') {
    showDaemonInfo({
      options: parseDaemonTargetArgs({
        argv: rest,
        cwdPath: deps.cwd(),
      }),
      deps,
    });
    return;
  }

  if (action === 'logs') {
    showDaemonLogs({
      options: parseDaemonLogsArgs({
        argv: rest,
        cwdPath: deps.cwd(),
      }),
      deps,
    });
    return;
  }

  throw new Error(getDaemonUsageText());
}

/**
 * Returns daemon command usage text.
 */
export function getDaemonUsageText(): string {
  return 'Usage: protege daemon <install|reinstall|uninstall|start|stop|restart|status|info|logs|enable|disable> [options]';
}

/**
 * Asserts daemon support constraints for current platform.
 */
export function assertLinuxDaemonSupport(
  args: {
    platform: string;
  },
): void {
  if (args.platform !== 'linux') {
    throw new Error('Daemon management is currently supported on Linux (systemd) only.');
  }
}

/**
 * Parses daemon install/reinstall arguments.
 */
export function parseDaemonInstallArgs(
  args: {
    argv: string[];
    cwdPath: string;
  },
): DaemonInstallOptions {
  const target = parseDaemonTargetArgs({
    argv: args.argv,
    cwdPath: args.cwdPath,
  });
  let envFilePath = join(target.workspacePath, '.secrets');
  let force = false;
  for (let index = 0; index < args.argv.length; index += 1) {
    const token = args.argv[index];
    if (token === '--env-file') {
      envFilePath = resolve(args.argv[index + 1] ?? envFilePath);
      index += 1;
      continue;
    }
    if (token === '--force') {
      force = true;
    }
  }

  return {
    ...target,
    envFilePath,
    force,
  };
}

/**
 * Parses daemon target arguments for commands operating on one unit.
 */
export function parseDaemonTargetArgs(
  args: {
    argv: string[];
    cwdPath: string;
  },
): DaemonTargetOptions {
  let scope: DaemonScope = 'user';
  let baseName = 'protege-gateway';
  let workspacePath = resolve(args.cwdPath);
  let unitName: string | undefined;
  let outputMode: CliOutputMode = 'pretty';

  for (let index = 0; index < args.argv.length; index += 1) {
    const token = args.argv[index];
    if (token === '--system') {
      scope = 'system';
      continue;
    }
    if (token === '--user') {
      scope = 'user';
      continue;
    }
    if (token === '--name') {
      baseName = args.argv[index + 1] ?? baseName;
      index += 1;
      continue;
    }
    if (token === '--cwd') {
      workspacePath = resolve(args.argv[index + 1] ?? workspacePath);
      index += 1;
      continue;
    }
    if (token === '--unit') {
      unitName = args.argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--json') {
      outputMode = 'json';
    }
  }

  return {
    scope,
    baseName,
    workspacePath,
    unitName,
    outputMode,
  };
}

/**
 * Parses daemon logs command arguments.
 */
export function parseDaemonLogsArgs(
  args: {
    argv: string[];
    cwdPath: string;
  },
): DaemonTargetOptions & {
  follow: boolean;
  lines: number;
} {
  const target = parseDaemonTargetArgs({
    argv: args.argv,
    cwdPath: args.cwdPath,
  });
  let follow = false;
  let lines = 200;
  for (let index = 0; index < args.argv.length; index += 1) {
    const token = args.argv[index];
    if (token === '--follow') {
      follow = true;
      continue;
    }
    if (token === '--lines') {
      lines = Number(args.argv[index + 1] ?? lines);
      index += 1;
    }
  }

  return {
    ...target,
    follow,
    lines: Number.isFinite(lines) && lines > 0 ? Math.floor(lines) : 200,
  };
}

/**
 * Installs one workspace-scoped daemon unit and reloads systemd.
 */
export function installDaemon(
  args: {
    options: DaemonInstallOptions;
    deps: DaemonCliDeps;
  },
): void {
  const unitName = resolveWorkspaceDaemonUnitName({
    baseName: args.options.baseName,
    workspacePath: args.options.workspacePath,
  });
  const unitFilePath = resolveDaemonUnitFilePath({
    scope: args.options.scope,
    unitName,
    homeDirPath: args.deps.homeDir(),
  });
  if (!args.options.force && args.deps.existsSync(unitFilePath)) {
    throw new Error(`Daemon unit already exists at ${unitFilePath}. Use --force to overwrite.`);
  }

  const protegeBinaryPath = args.deps.resolveProtegeBinaryPath();
  const nodeBinaryPath = args.deps.resolveNodeBinaryPath();
  const execStart = resolveDaemonExecStartCommand({
    protegeBinaryPath,
    nodeBinaryPath,
    resolveRealPath: args.deps.resolveRealPath,
    readFileSync: args.deps.readFileSync,
  });
  args.deps.mkdirSync(dirname(unitFilePath), { recursive: true });
  args.deps.writeFileSync(
    unitFilePath,
    renderSystemdUnitFile({
      unitName,
      workspacePath: args.options.workspacePath,
      envFilePath: args.options.envFilePath,
      execStart,
    }),
  );
  runSystemctlDaemonReload({
    scope: args.options.scope,
    deps: args.deps,
  });

  emitCliOutput({
    mode: args.options.outputMode,
    jsonValue: {
      action: 'install',
      scope: args.options.scope,
      unitName,
      unitFilePath,
      workspacePath: args.options.workspacePath,
      envFilePath: args.options.envFilePath,
      protegeBinaryPath,
      nodeBinaryPath,
      execStart,
    },
    prettyText: [
      'Daemon Installed',
      renderCliKeyValueTable({
        rows: [
          { key: 'scope', value: args.options.scope },
          { key: 'unitName', value: unitName },
          { key: 'unitFilePath', value: unitFilePath },
          { key: 'workspacePath', value: args.options.workspacePath },
          { key: 'envFilePath', value: args.options.envFilePath },
          { key: 'protegeBinaryPath', value: protegeBinaryPath },
          { key: 'nodeBinaryPath', value: nodeBinaryPath },
          { key: 'execStart', value: execStart },
        ],
      }),
    ].join('\n'),
  });
}

/**
 * Reinstalls one workspace-scoped daemon unit atomically.
 */
export function reinstallDaemon(
  args: {
    options: DaemonInstallOptions;
    deps: DaemonCliDeps;
  },
): void {
  uninstallDaemon({
    options: args.options,
    deps: args.deps,
    suppressOutput: true,
  });
  installDaemon({
    options: {
      ...args.options,
      force: true,
    },
    deps: args.deps,
  });
}

/**
 * Uninstalls one workspace-scoped daemon unit and reloads systemd.
 */
export function uninstallDaemon(
  args: {
    options: DaemonTargetOptions;
    deps: DaemonCliDeps;
    suppressOutput?: boolean;
  },
): void {
  const unitName = resolveTargetDaemonUnitName({
    options: args.options,
    deps: args.deps,
  });
  const unitFilePath = resolveDaemonUnitFilePath({
    scope: args.options.scope,
    unitName,
    homeDirPath: args.deps.homeDir(),
  });
  const unitInstalled = args.deps.existsSync(unitFilePath);
  if (!unitInstalled) {
    if (args.suppressOutput) {
      return;
    }
    emitCliOutput({
      mode: args.options.outputMode,
      jsonValue: {
        action: 'uninstall_skipped',
        reason: 'unit_not_installed',
        scope: args.options.scope,
        unitName,
        unitFilePath,
        workspacePath: args.options.workspacePath,
      },
      prettyText: [
        'Daemon Uninstall Skipped',
        'Reason: Unit is not installed.',
        renderCliKeyValueTable({
          rows: [
            { key: 'scope', value: args.options.scope },
            { key: 'unitName', value: unitName },
            { key: 'unitFilePath', value: unitFilePath },
            { key: 'workspacePath', value: args.options.workspacePath },
          ],
        }),
      ].join('\n'),
    });
    return;
  }

  const systemctlArgsPrefix = resolveSystemctlScopeArgs({
    scope: args.options.scope,
  });

  runShellCommandIgnoringFailure({
    command: {
      command: 'systemctl',
      argv: [...systemctlArgsPrefix, 'disable', unitName],
    },
    deps: args.deps,
  });
  runShellCommandIgnoringFailure({
    command: {
      command: 'systemctl',
      argv: [...systemctlArgsPrefix, 'stop', unitName],
    },
    deps: args.deps,
  });
  args.deps.rmSync(unitFilePath, { force: true });
  runSystemctlDaemonReload({
    scope: args.options.scope,
    deps: args.deps,
  });

  if (args.suppressOutput) {
    return;
  }
  emitCliOutput({
    mode: args.options.outputMode,
    jsonValue: {
      action: 'uninstall',
      scope: args.options.scope,
      unitName,
      unitFilePath,
      workspacePath: args.options.workspacePath,
    },
    prettyText: [
      'Daemon Uninstalled',
      renderCliKeyValueTable({
        rows: [
          { key: 'scope', value: args.options.scope },
          { key: 'unitName', value: unitName },
          { key: 'unitFilePath', value: unitFilePath },
          { key: 'workspacePath', value: args.options.workspacePath },
        ],
      }),
    ].join('\n'),
  });
}

/**
 * Executes one shell command and suppresses expected teardown failures.
 */
export function runShellCommandIgnoringFailure(
  args: {
    command: DaemonShellCommand;
    deps: DaemonCliDeps;
  },
): void {
  try {
    args.deps.runShellCommand({
      ...args.command,
      captureStdout: true,
      suppressStderr: true,
    });
  } catch {
    // Teardown commands may fail when the unit does not exist; removal remains idempotent.
  }
}

/**
 * Runs one systemctl lifecycle action against the workspace-scoped unit.
 */
export function runSystemctlUnitAction(
  args: {
    action: 'start' | 'stop' | 'restart' | 'enable' | 'disable';
    options: DaemonTargetOptions;
    deps: DaemonCliDeps;
  },
): void {
  const unitName = resolveTargetDaemonUnitName({
    options: args.options,
    deps: args.deps,
  });
  args.deps.runShellCommand({
    command: 'systemctl',
    argv: [
      ...resolveSystemctlScopeArgs({
        scope: args.options.scope,
      }),
      args.action,
      unitName,
    ],
  });
  emitCliText({
    value: `Daemon ${args.action}: ${unitName}`,
    trailingNewlines: 1,
  });
}

/**
 * Displays one daemon status snapshot by reading `systemctl show` fields.
 */
export function showDaemonStatus(
  args: {
    options: DaemonTargetOptions;
    deps: DaemonCliDeps;
  },
): void {
  const unitName = resolveTargetDaemonUnitName({
    options: args.options,
    deps: args.deps,
  });
  const output = args.deps.runShellCommand({
    command: 'systemctl',
    argv: [
      ...resolveSystemctlScopeArgs({
        scope: args.options.scope,
      }),
      'show',
      unitName,
      '--property=Id,ActiveState,SubState,MainPID,NRestarts,ExecMainStatus,ExecMainCode',
    ],
    captureStdout: true,
  });
  const parsed = parseSystemctlShowOutput({
    text: output,
  });
  emitCliOutput({
    mode: args.options.outputMode,
    jsonValue: {
      scope: args.options.scope,
      unitName,
      ...parsed,
    },
    prettyText: [
      'Daemon Status',
      renderCliKeyValueTable({
        rows: [
          { key: 'scope', value: args.options.scope },
          { key: 'unitName', value: unitName },
          { key: 'activeState', value: parsed.ActiveState ?? '' },
          { key: 'subState', value: parsed.SubState ?? '' },
          { key: 'mainPid', value: parsed.MainPID ?? '' },
          { key: 'restarts', value: parsed.NRestarts ?? '' },
          { key: 'execMainCode', value: parsed.ExecMainCode ?? '' },
          { key: 'execMainStatus', value: parsed.ExecMainStatus ?? '' },
        ],
      }),
    ].join('\n'),
  });
}

/**
 * Displays one daemon info snapshot from extended `systemctl show` fields.
 */
export function showDaemonInfo(
  args: {
    options: DaemonTargetOptions;
    deps: DaemonCliDeps;
  },
): void {
  const unitName = resolveTargetDaemonUnitName({
    options: args.options,
    deps: args.deps,
  });
  const output = args.deps.runShellCommand({
    command: 'systemctl',
    argv: [
      ...resolveSystemctlScopeArgs({
        scope: args.options.scope,
      }),
      'show',
      unitName,
      '--property=Id,FragmentPath,ActiveState,SubState,MainPID,NRestarts,ExecMainStartTimestamp,EnvironmentFiles',
    ],
    captureStdout: true,
  });
  const parsed = parseSystemctlShowOutput({
    text: output,
  });
  emitCliOutput({
    mode: args.options.outputMode,
    jsonValue: {
      scope: args.options.scope,
      unitName,
      workspacePath: args.options.workspacePath,
      ...parsed,
    },
    prettyText: [
      'Daemon Info',
      renderCliKeyValueTable({
        rows: [
          { key: 'scope', value: args.options.scope },
          { key: 'unitName', value: unitName },
          { key: 'workspacePath', value: args.options.workspacePath },
          { key: 'fragmentPath', value: parsed.FragmentPath ?? '' },
          { key: 'activeState', value: parsed.ActiveState ?? '' },
          { key: 'subState', value: parsed.SubState ?? '' },
          { key: 'mainPid', value: parsed.MainPID ?? '' },
          { key: 'restarts', value: parsed.NRestarts ?? '' },
          { key: 'startedAt', value: parsed.ExecMainStartTimestamp ?? '' },
          { key: 'environmentFiles', value: parsed.EnvironmentFiles ?? '' },
        ],
      }),
    ].join('\n'),
  });
}

/**
 * Streams or prints daemon logs from journald for one unit.
 */
export function showDaemonLogs(
  args: {
    options: DaemonTargetOptions & {
      follow: boolean;
      lines: number;
    };
    deps: DaemonCliDeps;
  },
): void {
  const unitName = resolveTargetDaemonUnitName({
    options: args.options,
    deps: args.deps,
  });
  const journalArgs = [
    ...resolveJournalctlScopeArgs({
      scope: args.options.scope,
    }),
    '-u',
    unitName,
    '-n',
    String(args.options.lines),
  ];
  if (args.options.follow) {
    journalArgs.push('-f');
  }
  if (!args.options.follow && args.options.outputMode === 'json') {
    const output = args.deps.runShellCommand({
      command: 'journalctl',
      argv: journalArgs,
      captureStdout: true,
    });
    emitCliOutput({
      mode: 'json',
      jsonValue: {
        scope: args.options.scope,
        unitName,
        lines: args.options.lines,
        follow: false,
        output,
      },
      prettyText: output,
    });
    return;
  }

  args.deps.runShellCommand({
    command: 'journalctl',
    argv: journalArgs,
  });
}

/**
 * Reloads systemd unit metadata for one scope.
 */
export function runSystemctlDaemonReload(
  args: {
    scope: DaemonScope;
    deps: DaemonCliDeps;
  },
): void {
  args.deps.runShellCommand({
    command: 'systemctl',
    argv: [
      ...resolveSystemctlScopeArgs({
        scope: args.scope,
      }),
      'daemon-reload',
    ],
  });
}

/**
 * Resolves systemctl scope arguments for user/system service managers.
 */
export function resolveSystemctlScopeArgs(
  args: {
    scope: DaemonScope;
  },
): string[] {
  return args.scope === 'user' ? ['--user'] : [];
}

/**
 * Resolves journalctl scope arguments for user/system journals.
 */
export function resolveJournalctlScopeArgs(
  args: {
    scope: DaemonScope;
  },
): string[] {
  return args.scope === 'user' ? ['--user'] : [];
}

/**
 * Resolves one target daemon unit name from explicit selection, installed units, or workspace hash.
 */
export function resolveTargetDaemonUnitName(
  args: {
    options: DaemonTargetOptions;
    deps: DaemonCliDeps;
  },
): string {
  if (args.options.unitName && args.options.unitName.trim().length > 0) {
    return normalizeDaemonUnitName({
      value: args.options.unitName,
    });
  }

  const workspaceUnitName = resolveWorkspaceDaemonUnitName({
    baseName: args.options.baseName,
    workspacePath: args.options.workspacePath,
  });
  const installedUnitNames = listInstalledDaemonUnitNames({
    scope: args.options.scope,
    baseName: args.options.baseName,
    deps: args.deps,
  });
  if (installedUnitNames.length === 1) {
    return installedUnitNames[0];
  }
  if (installedUnitNames.length === 0 || installedUnitNames.includes(workspaceUnitName)) {
    return workspaceUnitName;
  }

  throw new Error([
    'Multiple daemon units found for this base name.',
    'Specify --cwd <workspace> or --unit <unit-name>.',
    `Units: ${installedUnitNames.join(', ')}`,
  ].join(' '));
}

/**
 * Lists installed daemon unit names for one scope and base-name prefix.
 */
export function listInstalledDaemonUnitNames(
  args: {
    scope: DaemonScope;
    baseName: string;
    deps: DaemonCliDeps;
  },
): string[] {
  let output = '';
  try {
    output = args.deps.runShellCommand({
      command: 'systemctl',
      argv: [
        ...resolveSystemctlScopeArgs({
          scope: args.scope,
        }),
        'list-unit-files',
        `${normalizeDaemonBaseName({ value: args.baseName })}-*.service`,
        '--no-legend',
        '--no-pager',
      ],
      captureStdout: true,
    });
  } catch {
    return [];
  }
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s+/u)[0] ?? '')
    .filter((value) => value.endsWith('.service'));
}

/**
 * Normalizes explicit daemon unit names to include `.service`.
 */
export function normalizeDaemonUnitName(
  args: {
    value: string;
  },
): string {
  const trimmed = args.value.trim();
  if (trimmed.length === 0) {
    throw new Error('Daemon unit name cannot be empty.');
  }
  return trimmed.endsWith('.service') ? trimmed : `${trimmed}.service`;
}

/**
 * Resolves workspace-scoped daemon unit file name.
 */
export function resolveWorkspaceDaemonUnitName(
  args: {
    baseName: string;
    workspacePath: string;
  },
): string {
  const normalizedBase = normalizeDaemonBaseName({
    value: args.baseName,
  });
  const fingerprint = createWorkspaceFingerprint({
    workspacePath: args.workspacePath,
  });
  return `${normalizedBase}-${fingerprint}.service`;
}

/**
 * Creates one deterministic workspace fingerprint for unit naming.
 */
export function createWorkspaceFingerprint(
  args: {
    workspacePath: string;
  },
): string {
  return createHash('sha256').update(resolve(args.workspacePath)).digest('hex').slice(0, 12);
}

/**
 * Normalizes daemon unit base names for safe systemd unit tokens.
 */
export function normalizeDaemonBaseName(
  args: {
    value: string;
  },
): string {
  const trimmed = args.value.trim().replace(/\.service$/u, '');
  const normalized = trimmed.replace(/[^a-zA-Z0-9_.-]/gu, '-').toLowerCase();
  return normalized.length > 0 ? normalized : 'protege-gateway';
}

/**
 * Resolves daemon unit file path for one scope and unit name.
 */
export function resolveDaemonUnitFilePath(
  args: {
    scope: DaemonScope;
    unitName: string;
    homeDirPath: string;
  },
): string {
  if (args.scope === 'user') {
    return join(args.homeDirPath, '.config', 'systemd', 'user', args.unitName);
  }

  return join('/etc', 'systemd', 'system', args.unitName);
}

/**
 * Renders one systemd service unit text for Protege gateway runtime.
 */
export function renderSystemdUnitFile(
  args: {
    unitName: string;
    workspacePath: string;
    envFilePath: string;
    execStart: string;
  },
): string {
  return [
    '[Unit]',
    `Description=Protege Gateway (${args.unitName})`,
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
    `WorkingDirectory=${args.workspacePath}`,
    `EnvironmentFile=-${args.envFilePath}`,
    `ExecStart=${args.execStart}`,
    'Restart=on-failure',
    'RestartSec=2s',
    'StartLimitIntervalSec=60',
    'StartLimitBurst=5',
    'KillSignal=SIGTERM',
    'TimeoutStopSec=30',
    'NoNewPrivileges=true',
    `ReadWritePaths=${args.workspacePath}`,
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

/**
 * Parses `systemctl show` key-value output into one record.
 */
export function parseSystemctlShowOutput(
  args: {
    text: string;
  },
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const rawLine of args.text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    output[key] = value;
  }

  return output;
}

/**
 * Creates default daemon CLI runtime dependencies.
 */
export function createDefaultDaemonCliDeps(): DaemonCliDeps {
  return {
    platform: process.platform,
    cwd: () => process.cwd(),
    homeDir: () => homedir(),
    existsSync,
    mkdirSync: (
      path,
      options,
    ): void => {
      mkdirSync(path, options);
    },
    writeFileSync: (
      path,
      value,
    ): void => {
      writeFileSync(path, value, 'utf8');
    },
    readFileSync: (
      path,
      encoding,
    ): string => readFileSync(path, encoding),
    rmSync: (
      path,
      options,
    ): void => {
      rmSync(path, options);
    },
    runShellCommand: (
      command,
    ): string => {
      if (command.captureStdout) {
        return execFileSync(command.command, command.argv, {
          encoding: 'utf8',
          stdio: command.suppressStderr ? ['ignore', 'pipe', 'ignore'] : undefined,
        });
      }

      execFileSync(command.command, command.argv, {
        stdio: command.suppressStderr ? ['ignore', 'inherit', 'ignore'] : 'inherit',
      });
      return '';
    },
    resolveProtegeBinaryPath: (): string => resolveProtegeBinaryPath(),
    resolveNodeBinaryPath: (): string => resolveNodeBinaryPath(),
    resolveRealPath: (
      path,
    ): string => realpathSync(path),
  };
}

/**
 * Resolves one absolute installed `protege` binary path from shell lookup.
 */
export function resolveProtegeBinaryPath(): string {
  const output = execFileSync('bash', ['-lc', 'command -v protege'], {
    encoding: 'utf8',
  }).trim();
  if (output.length === 0) {
    throw new Error('Unable to resolve installed protege binary path. Ensure `protege` is on PATH.');
  }

  return output;
}

/**
 * Resolves one absolute installed `node` binary path from shell lookup.
 */
export function resolveNodeBinaryPath(): string {
  const output = execFileSync('bash', ['-lc', 'command -v node'], {
    encoding: 'utf8',
  }).trim();
  if (output.length === 0) {
    throw new Error('Unable to resolve node binary path. Ensure `node` is on PATH.');
  }

  return output;
}

/**
 * Resolves one systemd-safe ExecStart command for the installed Protege CLI.
 */
export function resolveDaemonExecStartCommand(
  args: {
    protegeBinaryPath: string;
    nodeBinaryPath: string;
    resolveRealPath: (
      path: string,
    ) => string;
    readFileSync: (
      path: string,
      encoding: BufferEncoding,
    ) => string;
  },
): string {
  const resolvedProtegePath = args.resolveRealPath(args.protegeBinaryPath);
  const shebangLine = readFirstFileLine({
    filePath: resolvedProtegePath,
    readFileSync: args.readFileSync,
  });
  if (shebangLine.includes('node')) {
    return `${args.nodeBinaryPath} ${resolvedProtegePath} gateway start`;
  }

  return `${resolvedProtegePath} gateway start`;
}

/**
 * Reads one first line from a file for launcher shebang detection.
 */
export function readFirstFileLine(
  args: {
    filePath: string;
    readFileSync: (
      path: string,
      encoding: BufferEncoding,
    ) => string;
  },
): string {
  try {
    const text = args.readFileSync(args.filePath, 'utf8');
    const firstLine = text.split(/\r?\n/u, 1)[0] ?? '';
    return firstLine.startsWith('#!') ? firstLine : '';
  } catch {
    return '';
  }
}
