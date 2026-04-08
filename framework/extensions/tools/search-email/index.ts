import type {
  HarnessToolDefinition,
  HarnessToolExecutionContext,
} from 'protege-toolkit';

/**
 * Represents the accepted input payload schema for search_email execution.
 */
export type SearchEmailToolInput = {
  query?: string;
  from?: string;
  to?: string;
  subject?: string;
  direction?: 'inbound' | 'outbound' | 'synthetic';
  after?: string;
  before?: string;
  limit?: number;
};

/**
 * Represents one typed validation error for invalid search_email inputs.
 */
export class SearchEmailToolInputError extends Error { }

/**
 * Creates one search_email tool definition with validated input execution behavior.
 */
export function createSearchEmailTool(): HarnessToolDefinition {
  return {
    name: 'search_email',
    description: 'Search your own inbox — messages sent to and from you. Supports full-text query, sender, recipient, subject, direction, and date range filters. Returns full message content and metadata.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'Full-text search query across subject and body.',
        },
        from: {
          type: 'string',
          description: 'Filter by sender email address (substring match).',
        },
        to: {
          type: 'string',
          description: 'Filter by recipient email address (substring match).',
        },
        subject: {
          type: 'string',
          description: 'Filter by subject line (substring match, case-insensitive).',
        },
        direction: {
          type: 'string',
          enum: ['inbound', 'outbound', 'synthetic'],
          description: 'Filter by message direction.',
        },
        after: {
          type: 'string',
          description: 'Return messages received after this ISO date.',
        },
        before: {
          type: 'string',
          description: 'Return messages received before this ISO date.',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results to return. Default 20, max 50.',
          minimum: 1,
          maximum: 50,
        },
      },
    },
    execute: async (
      executeArgs: {
        input: Record<string, unknown>;
        context: HarnessToolExecutionContext;
      },
    ): Promise<Record<string, unknown>> => {
      return executeSearchEmailTool({
        input: executeArgs.input,
        context: executeArgs.context,
      });
    },
  };
}

/**
 * Executes the search_email tool by querying the persona's temporal database.
 */
export async function executeSearchEmailTool(
  args: {
    input: Record<string, unknown>;
    context: HarnessToolExecutionContext;
  },
): Promise<Record<string, unknown>> {
  const { db } = args.context;
  const input = normalizeSearchEmailInput({ input: args.input });
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);

  const conditions: string[] = [];
  const params: unknown[] = [];

  let baseTable: string;

  if (input.query) {
    const sanitizedQuery = sanitizeFtsQuery({ query: input.query });
    baseTable = 'messages_fts AS fts JOIN messages AS m ON fts.message_pk = m.id';
    conditions.push('fts.messages_fts MATCH ?');
    params.push(sanitizedQuery);
  } else {
    baseTable = 'messages AS m';
  }

  if (input.from) {
    conditions.push('m.sender LIKE ?');
    params.push(`%${input.from}%`);
  }
  if (input.to) {
    conditions.push('m.recipients LIKE ?');
    params.push(`%${input.to}%`);
  }
  if (input.subject) {
    conditions.push('m.subject LIKE ?');
    params.push(`%${input.subject}%`);
  }
  if (input.direction) {
    conditions.push('m.direction = ?');
    params.push(input.direction);
  }
  if (input.after) {
    conditions.push('m.received_at > ?');
    params.push(input.after);
  }
  if (input.before) {
    conditions.push('m.received_at < ?');
    params.push(input.before);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const sql = `SELECT m.id, m.thread_id, m.direction, m.message_id, m.in_reply_to, m.sender, m.recipients, m.subject, m.text_body, m.html_body, m.received_at, m.raw_mime_path, m.metadata_json FROM ${baseTable} ${whereClause} ORDER BY m.received_at DESC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Array<Record<string, string | null>>;

  const messages = rows.map((row) => ({
    id: row.id,
    threadId: row.thread_id,
    direction: row.direction,
    messageId: row.message_id,
    inReplyTo: row.in_reply_to,
    sender: row.sender,
    recipients: row.recipients,
    subject: row.subject,
    textBody: row.text_body,
    htmlBody: row.html_body,
    receivedAt: row.received_at,
    rawMimePath: row.raw_mime_path,
    metadata: parseMetadataJson({ value: row.metadata_json }),
  }));

  return { messages };
}

/**
 * Sanitizes an FTS5 query string to prevent operator injection.
 * Wraps user input in double quotes to treat as a literal phrase,
 * unless it's a bare wildcard (*) for match-all.
 */
export function sanitizeFtsQuery(
  args: {
    query: string;
  },
): string {
  const trimmed = args.query.trim();
  return `"${trimmed.replace(/"/g, '""')}"`;
}

/**
 * Validates and normalizes one raw tool input payload into search-email filter fields.
 */
export function normalizeSearchEmailInput(
  args: {
    input: Record<string, unknown>;
  },
): SearchEmailToolInput {
  const query = readOptionalString({ value: args.input.query });
  const from = readOptionalString({ value: args.input.from });
  const to = readOptionalString({ value: args.input.to });
  const subject = readOptionalString({ value: args.input.subject });
  const direction = readOptionalDirection({ value: args.input.direction });
  const after = readOptionalString({ value: args.input.after });
  const before = readOptionalString({ value: args.input.before });
  const limit = readOptionalLimit({ value: args.input.limit });

  if (!query && !from && !to && !subject && !direction && !after && !before) {
    throw new SearchEmailToolInputError('search_email requires at least one filter (query, from, to, subject, direction, after, or before).');
  }

  return { query, from, to, subject, direction, after, before, limit };
}

/**
 * Reads one optional non-empty string.
 */
function readOptionalString(
  args: { value: unknown },
): string | undefined {
  return typeof args.value === 'string' && args.value.trim().length > 0
    ? args.value
    : undefined;
}

/**
 * Reads one optional direction and validates supported values.
 */
function readOptionalDirection(
  args: { value: unknown },
): 'inbound' | 'outbound' | 'synthetic' | undefined {
  if (args.value === undefined) {
    return undefined;
  }
  if (args.value === 'inbound' || args.value === 'outbound' || args.value === 'synthetic') {
    return args.value;
  }
  throw new SearchEmailToolInputError('search_email input field "direction" must be "inbound", "outbound", or "synthetic".');
}

/**
 * Reads one optional integer limit.
 */
function readOptionalLimit(
  args: { value: unknown },
): number | undefined {
  if (args.value === undefined) {
    return undefined;
  }
  if (typeof args.value === 'number' && Number.isInteger(args.value)) {
    return args.value;
  }
  throw new SearchEmailToolInputError('search_email input field "limit" must be an integer.');
}

/**
 * Parses metadata_json into a structured object.
 */
function parseMetadataJson(
  args: { value: string | null },
): Record<string, unknown> {
  if (!args.value) {
    return {};
  }
  try {
    return JSON.parse(args.value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Exports the search-email tool module contract consumed by the harness registry loader.
 */
export const tool = createSearchEmailTool();
