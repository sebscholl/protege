/**
 * Returns the Protege ASCII banner used in CLI-facing setup/init output.
 */
export function readCliBanner(): string {
  return [
    '',
    '        _.~"~.',
    '       /      \\     ___  ___  ___  _____  ___  ___  ___',
    '      ||       |   | _ \\| _ \\/ _ \\|_   _|| __/ __|| __|',
    '      ||       |   |  _/|   / (_) | | |  | _| (_ || _|',
    '       \\\\     /    |_|  |_|_\\\\___/  |_|  |___\\___||___|',
    '        `~--~`',
    '',
  ].join('\n');
}
