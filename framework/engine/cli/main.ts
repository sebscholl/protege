import { runCli } from '@engine/cli/index';

/**
 * Runs CLI command dispatch using current process argv tokens.
 */
async function main(): Promise<void> {
  try {
    await runCli({
      argv: process.argv.slice(2),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

void main();
