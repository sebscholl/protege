import { spawn } from 'node:child_process';

import {
  readOptionalRuntimePositiveInteger,
  readRequiredRuntimePath,
  readRequiredRuntimeString,
} from '../shared/runtime-action-helpers';

/**
 * Represents one shell execution result payload before runtime response mapping.
 */
export type ShellExecRuntimeResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  shell: string;
  shellType: string;
  cwd: string;
  platform: NodeJS.Platform;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
};

const DEFAULT_SHELL_TIMEOUT_MS = 120000;
const DEFAULT_SHELL_MAX_OUTPUT_CHARS = 12000;

/**
 * Runs one shell.exec runtime action and returns bounded structured shell output.
 */
export async function runShellExecRuntimeAction(
  args: {
    payload: Record<string, unknown>;
    executeShellCommandFn?: (
      args: {
        command: string;
        cwd: string;
        timeoutMs: number;
        maxOutputChars: number;
      },
    ) => Promise<ShellExecRuntimeResult>;
  },
): Promise<Record<string, unknown>> {
  const command = readRequiredRuntimeString({
    payload: args.payload,
    fieldName: 'command',
    actionName: 'shell.exec',
  });
  const timeoutMs = readOptionalRuntimePositiveInteger({
    payload: args.payload,
    fieldName: 'timeoutMs',
    actionName: 'shell.exec',
  }) ?? DEFAULT_SHELL_TIMEOUT_MS;
  const maxOutputChars = readOptionalRuntimePositiveInteger({
    payload: args.payload,
    fieldName: 'maxOutputChars',
    actionName: 'shell.exec',
  }) ?? DEFAULT_SHELL_MAX_OUTPUT_CHARS;
  const cwd = args.payload.workdir === undefined
    ? process.cwd()
    : readRequiredRuntimePath({
      payload: args.payload,
      fieldName: 'workdir',
      actionName: 'shell.exec',
      enforceWorkspaceRoot: true,
    });
  const executeCommand = args.executeShellCommandFn ?? executeShellCommand;
  return executeCommand({
    command,
    cwd,
    timeoutMs,
    maxOutputChars,
  });
}

/**
 * Executes one shell command with timeout and output caps using the current runtime shell.
 */
export function executeShellCommand(
  args: {
    command: string;
    cwd: string;
    timeoutMs: number;
    maxOutputChars: number;
  },
): Promise<ShellExecRuntimeResult> {
  const shellExecutable = resolveShellExecutable();
  const shellType = resolveShellType({
    shellExecutable,
  });
  const shellArgs = resolveShellArgs({
    shellType,
    command: args.command,
  });
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(shellExecutable, shellArgs, {
      cwd: args.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let completed = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, args.timeoutMs);

    child.stdout.on('data', (chunk: Buffer | string): void => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      stdout += text;
      if (stdout.length > args.maxOutputChars) {
        stdout = stdout.slice(0, args.maxOutputChars);
        stdoutTruncated = true;
      }
    });

    child.stderr.on('data', (chunk: Buffer | string): void => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      stderr += text;
      if (stderr.length > args.maxOutputChars) {
        stderr = stderr.slice(0, args.maxOutputChars);
        stderrTruncated = true;
      }
    });

    child.on('close', (code: number | null): void => {
      if (completed) {
        return;
      }

      completed = true;
      clearTimeout(timeoutHandle);
      resolve({
        exitCode: timedOut ? 124 : (code ?? 1),
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - startedAt,
        shell: shellExecutable,
        shellType,
        cwd: args.cwd,
        platform: process.platform,
        stdoutTruncated,
        stderrTruncated,
      });
    });
  });
}

/**
 * Resolves one runtime shell executable path from environment or platform defaults.
 */
export function resolveShellExecutable(): string {
  if (process.env.SHELL && process.env.SHELL.trim().length > 0) {
    return process.env.SHELL;
  }
  if (process.env.COMSPEC && process.env.COMSPEC.trim().length > 0) {
    return process.env.COMSPEC;
  }
  return process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
}

/**
 * Resolves one shell type label from executable path text.
 */
export function resolveShellType(
  args: {
    shellExecutable: string;
  },
): string {
  const executableLower = args.shellExecutable.toLowerCase();
  if (executableLower.includes('powershell') || executableLower.includes('pwsh')) {
    return 'powershell';
  }
  if (executableLower.includes('cmd.exe')) {
    return 'cmd';
  }
  if (executableLower.endsWith('/zsh') || executableLower === 'zsh') {
    return 'zsh';
  }
  if (executableLower.endsWith('/bash') || executableLower === 'bash') {
    return 'bash';
  }
  if (executableLower.endsWith('/sh') || executableLower === 'sh') {
    return 'sh';
  }

  return 'shell';
}

/**
 * Resolves command argument vectors for supported shell types.
 */
export function resolveShellArgs(
  args: {
    shellType: string;
    command: string;
  },
): string[] {
  if (args.shellType === 'powershell') {
    return ['-NoProfile', '-Command', args.command];
  }
  if (args.shellType === 'cmd') {
    return ['/d', '/s', '/c', args.command];
  }

  return ['-lc', args.command];
}
