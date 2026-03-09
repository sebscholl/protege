/**
 * Normalizes tool text content by decoding likely double-escaped model payloads.
 */
export function normalizeToolTextContent(
  args: {
    content: string;
  },
): string {
  const decodedQuotedPayload = decodeQuotedJsonStringPayload({
    content: args.content,
  });
  if (decodedQuotedPayload !== undefined) {
    return decodedQuotedPayload;
  }
  if (!shouldDecodeUnquotedEscapes({
    content: args.content,
  })) {
    return args.content;
  }

  return decodeCommonEscapedSequences({
    content: args.content,
  });
}

/**
 * Decodes one quoted JSON string payload when model output was escaped twice.
 */
export function decodeQuotedJsonStringPayload(
  args: {
    content: string;
  },
): string | undefined {
  const trimmed = args.content.trim();
  if (trimmed.length < 2 || !trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'string' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns true when unquoted escaped-sequence decoding is likely intended.
 */
export function shouldDecodeUnquotedEscapes(
  args: {
    content: string;
  },
): boolean {
  if (args.content.includes('\n')) {
    return false;
  }

  return countStringOccurrences({
    value: args.content,
    token: '\\n',
  }) >= 2;
}

/**
 * Decodes common escaped control sequences used in double-escaped tool payloads.
 */
export function decodeCommonEscapedSequences(
  args: {
    content: string;
  },
): string {
  return args.content
    .replace(/\\r\\n/g, '\r\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/**
 * Counts token occurrences in one string value.
 */
export function countStringOccurrences(
  args: {
    value: string;
    token: string;
  },
): number {
  if (args.token.length === 0) {
    return 0;
  }

  return args.value.split(args.token).length - 1;
}
