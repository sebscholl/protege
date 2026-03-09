import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Represents one supported config file payload for test scaffolding helpers.
 */
export type TestConfigFilePayload = string | Record<string, unknown>;

/**
 * Writes one or more files under `configs/` for one test workspace.
 */
export function writeTestConfigFiles(
  args: {
    tempRootPath: string;
    files: Record<string, TestConfigFilePayload>;
  },
): void {
  const configDirPath = join(args.tempRootPath, 'configs');
  mkdirSync(configDirPath, { recursive: true });

  for (const [fileName, payload] of Object.entries(args.files)) {
    const filePath = join(configDirPath, fileName);
    if (typeof payload === 'string') {
      writeFileSync(filePath, payload);
      continue;
    }

    writeFileSync(filePath, JSON.stringify(payload));
  }
}
