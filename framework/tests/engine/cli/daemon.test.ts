import { beforeAll, describe, expect, it } from 'vitest';

import {
  assertLinuxDaemonSupport,
  createWorkspaceFingerprint,
  installDaemon,
  listInstalledDaemonUnitNames,
  normalizeDaemonUnitName,
  parseDaemonInstallArgs,
  readFirstFileLine,
  resolveDaemonExecStartCommand,
  resolveTargetDaemonUnitName,
  parseDaemonLogsArgs,
  parseDaemonTargetArgs,
  parseSystemctlShowOutput,
  renderSystemdUnitFile,
  resolveDaemonUnitFilePath,
  resolveSystemctlScopeArgs,
  resolveWorkspaceDaemonUnitName,
  runDaemonCli,
  runShellCommandIgnoringFailure,
  uninstallDaemon,
} from '@engine/cli/daemon';

type FakeDeps = Parameters<typeof runDaemonCli>[0]['deps'] & {
  calls: Array<{
    command: string;
    argv: string[];
    captureStdout?: boolean;
  }>;
  files: Record<string, string>;
};

let parsedInstall = parseDaemonInstallArgs({
  argv: [],
  cwdPath: '/tmp/workspace',
});
let parsedTarget = parseDaemonTargetArgs({
  argv: ['--system', '--cwd', '/srv/app', '--name', 'edge'],
  cwdPath: '/tmp/workspace',
});
let parsedTargetWithUnit = parseDaemonTargetArgs({
  argv: ['--unit', 'custom-daemon'],
  cwdPath: '/tmp/workspace',
});
let parsedLogs = parseDaemonLogsArgs({
  argv: ['--follow', '--lines', '50'],
  cwdPath: '/tmp/workspace',
});
let parsedSystemctl = parseSystemctlShowOutput({
  text: 'ActiveState=active\nMainPID=123\n',
});
let fingerprintA = '';
let fingerprintB = '';
let unitName = '';
let unitFile = '';
let renderedUnit = '';
let fakeDeps: FakeDeps;
let unitExistsAfterUninstall = false;
let uninstallWithoutUnitThrew = false;
let daemonExecStart = '';
let firstShebangLine = '';
let firstNonShebangLine = '';
let teardownSuppressedCommand = {
  captureStdout: false,
  suppressStderr: false,
};
let uninstallSkippedDidRunTeardownCommands = false;

beforeAll((): void => {
  fingerprintA = createWorkspaceFingerprint({
    workspacePath: '/tmp/workspace-a',
  });
  fingerprintB = createWorkspaceFingerprint({
    workspacePath: '/tmp/workspace-b',
  });
  unitName = resolveWorkspaceDaemonUnitName({
    baseName: 'protege-gateway',
    workspacePath: '/tmp/workspace-a',
  });
  unitFile = resolveDaemonUnitFilePath({
    scope: 'user',
    unitName,
    homeDirPath: '/home/tester',
  });
  renderedUnit = renderSystemdUnitFile({
    unitName,
    workspacePath: '/tmp/workspace-a',
    envFilePath: '/tmp/workspace-a/.secrets',
    execStart: '/usr/local/bin/node /usr/local/lib/node_modules/protege/dist/main.js gateway start',
  });
  daemonExecStart = resolveDaemonExecStartCommand({
    protegeBinaryPath: '/usr/local/bin/protege',
    nodeBinaryPath: '/usr/local/bin/node',
    resolveRealPath: (
      path,
    ): string => path === '/usr/local/bin/protege' ? '/usr/local/lib/node_modules/protege/dist/main.js' : path,
    readFileSync: (
      path,
    ): string => path === '/usr/local/lib/node_modules/protege/dist/main.js'
      ? '#!/usr/bin/env node\nconsole.log("ok");\n'
      : '',
  });
  firstShebangLine = readFirstFileLine({
    filePath: '/tmp/with-shebang',
    readFileSync: (): string => '#!/usr/bin/env node\nconsole.log("x");\n',
  });
  firstNonShebangLine = readFirstFileLine({
    filePath: '/tmp/no-shebang',
    readFileSync: (): string => 'console.log("x");\n',
  });
  fakeDeps = {
    platform: 'linux',
    cwd: (): string => '/tmp/workspace-a',
    homeDir: (): string => '/home/tester',
    existsSync: (
      path: string,
    ): boolean => Object.prototype.hasOwnProperty.call(fakeDeps.files, path),
    mkdirSync: (): void => undefined,
    writeFileSync: (
      path: string,
      value: string,
    ): void => {
      fakeDeps.files[path] = value;
    },
    readFileSync: (
      path: string,
    ): string => fakeDeps.files[path] ?? '',
    rmSync: (
      path: string,
    ): void => {
      delete fakeDeps.files[path];
    },
    runShellCommand: (
      command,
    ): string => {
      fakeDeps.calls.push(command);
      if (command.captureStdout) {
        return 'ActiveState=active\nSubState=running\nMainPID=111\nNRestarts=0\n';
      }

      return '';
    },
    resolveProtegeBinaryPath: (): string => '/usr/local/bin/protege',
    resolveNodeBinaryPath: (): string => '/usr/local/bin/node',
    resolveRealPath: (
      path: string,
    ): string => path === '/usr/local/bin/protege' ? '/usr/local/lib/node_modules/protege/dist/main.js' : path,
    calls: [],
    files: {},
  };
  runDaemonCli({
    argv: ['install', '--cwd', '/tmp/workspace-a'],
    deps: fakeDeps,
  });
  const uninstallDeps: FakeDeps = {
    ...fakeDeps,
    calls: [],
    files: {},
    existsSync: (
      path: string,
    ): boolean => Object.prototype.hasOwnProperty.call(uninstallDeps.files, path),
    writeFileSync: (
      path: string,
      value: string,
    ): void => {
      uninstallDeps.files[path] = value;
    },
    readFileSync: (
      path: string,
    ): string => uninstallDeps.files[path] ?? '',
    rmSync: (
      path: string,
    ): void => {
      delete uninstallDeps.files[path];
    },
    runShellCommand: (
      command,
    ): string => {
      uninstallDeps.calls.push(command);
      if (command.command === 'systemctl' && (command.argv.includes('disable') || command.argv.includes('stop'))) {
        throw new Error('Unit not loaded.');
      }

      return '';
    },
  };
  installDaemon({
    options: parseDaemonInstallArgs({
      argv: ['--cwd', '/tmp/workspace-a', '--force'],
      cwdPath: '/tmp/workspace-a',
    }),
    deps: uninstallDeps,
  });
  try {
    uninstallDaemon({
      options: parseDaemonTargetArgs({
        argv: ['--cwd', '/tmp/workspace-a'],
        cwdPath: '/tmp/workspace-a',
      }),
      deps: uninstallDeps,
      suppressOutput: true,
    });
  } catch {
    uninstallWithoutUnitThrew = true;
  }
  const uninstallUnitName = resolveWorkspaceDaemonUnitName({
    baseName: 'protege-gateway',
    workspacePath: '/tmp/workspace-a',
  });
  const uninstallUnitPath = resolveDaemonUnitFilePath({
    scope: 'user',
    unitName: uninstallUnitName,
    homeDirPath: '/home/tester',
  });
  unitExistsAfterUninstall = Object.prototype.hasOwnProperty.call(uninstallDeps.files, uninstallUnitPath);
  const uninstallSkippedDeps: FakeDeps = {
    ...fakeDeps,
    calls: [],
    files: {},
    existsSync: (): boolean => false,
    runShellCommand: (
      command,
    ): string => {
      uninstallSkippedDeps.calls.push(command);
      return '';
    },
  };
  uninstallDaemon({
    options: parseDaemonTargetArgs({
      argv: ['--cwd', '/tmp/workspace-a'],
      cwdPath: '/tmp/workspace-a',
    }),
    deps: uninstallSkippedDeps,
    suppressOutput: true,
  });
  uninstallSkippedDidRunTeardownCommands = uninstallSkippedDeps.calls.some((call) =>
    call.argv.includes('disable') || call.argv.includes('stop'));
});

describe('daemon cli parsing and rendering', () => {
  it('parses install defaults from cwd', () => {
    expect(parsedInstall.envFilePath.endsWith('/tmp/workspace/.secrets')).toBe(true);
  });

  it('parses target scope cwd and custom base name', () => {
    expect(parsedTarget.scope === 'system' && parsedTarget.baseName === 'edge' && parsedTarget.workspacePath === '/srv/app').toBe(true);
  });

  it('parses explicit unit name override from target args', () => {
    expect(parsedTargetWithUnit.unitName === 'custom-daemon').toBe(true);
  });

  it('parses logs follow and line count flags', () => {
    expect(parsedLogs.follow && parsedLogs.lines === 50).toBe(true);
  });

  it('parses systemctl key value output', () => {
    expect(parsedSystemctl.ActiveState === 'active' && parsedSystemctl.MainPID === '123').toBe(true);
  });

  it('creates distinct fingerprints for different workspaces', () => {
    expect(fingerprintA !== fingerprintB).toBe(true);
  });

  it('builds workspace-scoped service unit names', () => {
    expect(unitName.endsWith('.service')).toBe(true);
  });

  it('resolves user scoped systemd unit path under home config', () => {
    expect(unitFile.includes('/home/tester/.config/systemd/user/')).toBe(true);
  });

  it('renders exec start with installed protege binary path', () => {
    expect(renderedUnit.includes('ExecStart=/usr/local/bin/node /usr/local/lib/node_modules/protege/dist/main.js gateway start')).toBe(true);
  });

  it('uses --user flag for user scoped systemctl calls', () => {
    expect(resolveSystemctlScopeArgs({ scope: 'user' }).includes('--user')).toBe(true);
  });

  it('builds daemon exec start using node when protege launcher has node shebang', () => {
    expect(daemonExecStart).toBe('/usr/local/bin/node /usr/local/lib/node_modules/protege/dist/main.js gateway start');
  });

  it('reads first shebang line for launcher detection', () => {
    expect(firstShebangLine).toBe('#!/usr/bin/env node');
  });

  it('returns empty first line when file does not start with shebang', () => {
    expect(firstNonShebangLine).toBe('');
  });
});

describe('daemon cli runtime behavior', () => {
  it('writes one workspace service unit file on install', () => {
    expect(Object.keys(fakeDeps.files).some((path) => path.endsWith('.service'))).toBe(true);
  });

  it('runs systemctl daemon-reload during install', () => {
    expect(fakeDeps.calls.some((call) => call.command === 'systemctl' && call.argv.includes('daemon-reload'))).toBe(true);
  });

  it('rejects daemon commands on non-linux platform', () => {
    expect(() => assertLinuxDaemonSupport({ platform: 'darwin' })).toThrow('Linux');
  });

  it('does not throw uninstall when stop or disable fails for missing unit', () => {
    expect(uninstallWithoutUnitThrew).toBe(false);
  });

  it('removes daemon unit file during uninstall when teardown commands fail', () => {
    expect(unitExistsAfterUninstall).toBe(false);
  });

  it('skips uninstall teardown commands when unit is not installed', () => {
    expect(uninstallSkippedDidRunTeardownCommands).toBe(false);
  });
});

describe('daemon shell helpers', () => {
  it('swallows teardown command failures in safe shell wrapper', () => {
    expect(() => runShellCommandIgnoringFailure({
      command: {
        command: 'systemctl',
        argv: ['disable', 'missing.service'],
      },
      deps: {
        ...fakeDeps,
        runShellCommand: (): string => {
          throw new Error('missing');
        },
      },
    })).not.toThrow();
  });

  it('forces stdout capture and stderr suppression for teardown shell wrapper', () => {
    runShellCommandIgnoringFailure({
      command: {
        command: 'systemctl',
        argv: ['disable', 'missing.service'],
      },
      deps: {
        ...fakeDeps,
        runShellCommand: (
          command,
        ): string => {
          teardownSuppressedCommand = {
            captureStdout: Boolean(command.captureStdout),
            suppressStderr: Boolean(command.suppressStderr),
          };
          return '';
        },
      },
    });
    expect(teardownSuppressedCommand.captureStdout && teardownSuppressedCommand.suppressStderr).toBe(true);
  });
});

describe('daemon unit resolution behavior', () => {
  it('uses explicit --unit override when provided', () => {
    const selectedUnit = resolveTargetDaemonUnitName({
      options: {
        scope: 'user',
        baseName: 'protege-gateway',
        workspacePath: '/tmp/workspace-a',
        unitName: 'manual-unit',
        outputMode: 'pretty',
      },
      deps: fakeDeps,
    });
    expect(selectedUnit).toBe('manual-unit.service');
  });

  it('selects single installed unit when exactly one exists', () => {
    const selectedUnit = resolveTargetDaemonUnitName({
      options: {
        scope: 'user',
        baseName: 'protege-gateway',
        workspacePath: '/tmp/workspace-z',
        outputMode: 'pretty',
      },
      deps: {
        ...fakeDeps,
        runShellCommand: (
          command,
        ): string => command.captureStdout ? 'protege-gateway-abc123.service enabled\n' : '',
      },
    });
    expect(selectedUnit).toBe('protege-gateway-abc123.service');
  });

  it('throws disambiguation error when multiple installed units exist', () => {
    expect(() => resolveTargetDaemonUnitName({
      options: {
        scope: 'user',
        baseName: 'protege-gateway',
        workspacePath: '/tmp/workspace-z',
        outputMode: 'pretty',
      },
      deps: {
        ...fakeDeps,
        runShellCommand: (
          command,
        ): string => command.captureStdout
          ? 'protege-gateway-1.service enabled\nprotege-gateway-2.service disabled\n'
          : '',
      },
    })).toThrow('Multiple daemon units found');
  });

  it('normalizes explicit unit values to include .service suffix', () => {
    expect(normalizeDaemonUnitName({ value: 'abc' })).toBe('abc.service');
  });

  it('returns empty installed list when systemctl listing fails', () => {
    const units = listInstalledDaemonUnitNames({
      scope: 'user',
      baseName: 'protege-gateway',
      deps: {
        ...fakeDeps,
        runShellCommand: (): string => {
          throw new Error('not found');
        },
      },
    });
    expect(units.length === 0).toBe(true);
  });
});
