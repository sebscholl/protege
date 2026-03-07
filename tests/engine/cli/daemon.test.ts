import { beforeAll, describe, expect, it } from 'vitest';

import {
  assertLinuxDaemonSupport,
  createWorkspaceFingerprint,
  installDaemon,
  parseDaemonInstallArgs,
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
    protegeBinaryPath: '/usr/local/bin/protege',
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
});

describe('daemon cli parsing and rendering', () => {
  it('parses install defaults from cwd', () => {
    expect(parsedInstall.envFilePath.endsWith('/tmp/workspace/.secrets')).toBe(true);
  });

  it('parses target scope cwd and custom base name', () => {
    expect(parsedTarget.scope === 'system' && parsedTarget.baseName === 'edge' && parsedTarget.workspacePath === '/srv/app').toBe(true);
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
    expect(renderedUnit.includes('ExecStart=/usr/local/bin/protege gateway start')).toBe(true);
  });

  it('uses --user flag for user scoped systemctl calls', () => {
    expect(resolveSystemctlScopeArgs({ scope: 'user' }).includes('--user')).toBe(true);
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
});
