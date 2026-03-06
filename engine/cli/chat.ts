import { startChatRuntime } from '@engine/chat/runtime';

/**
 * Represents parsed `protege chat` command options.
 */
export type ChatCommandOptions = {
  persona?: string;
  threadId?: string;
};

/**
 * Parses `protege chat` arguments.
 */
export function parseChatArgs(
  args: {
    argv: string[];
  },
): ChatCommandOptions {
  let persona: string | undefined;
  let threadId: string | undefined;
  for (let index = 0; index < args.argv.length; index += 1) {
    const token = args.argv[index];
    if (token === '--persona') {
      persona = args.argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (token === '--thread') {
      threadId = args.argv[index + 1] ?? undefined;
      index += 1;
    }
  }

  const normalizedPersona = persona && persona.trim().length > 0 ? persona : undefined;

  return {
    persona: normalizedPersona,
    threadId,
  };
}

/**
 * Runs the chat command runtime with parsed CLI options.
 */
export async function runChatCommand(
  args: {
    argv: string[];
  },
): Promise<void> {
  const options = parseChatArgs({
    argv: args.argv,
  });
  await startChatRuntime({
    personaSelector: options.persona,
    threadId: options.threadId,
  });
}
