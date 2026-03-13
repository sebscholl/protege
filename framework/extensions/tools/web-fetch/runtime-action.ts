import {
  readOptionalRuntimePositiveInteger,
  readRequiredHttpRuntimeUrl,
} from '../shared/runtime-action-helpers';

const DEFAULT_WEB_FETCH_TIMEOUT_MS = 10000;
const DEFAULT_WEB_FETCH_MAX_BYTES = 200000;
const DEFAULT_WEB_FETCH_MAX_REDIRECTS = 5;

/**
 * Runs one web.fetch runtime action and returns normalized readable page content.
 */
export async function runWebFetchRuntimeAction(
  args: {
    payload: Record<string, unknown>;
    fetchFn?: typeof fetch;
  },
): Promise<Record<string, unknown>> {
  const url = readRequiredHttpRuntimeUrl({
    payload: args.payload,
    fieldName: 'url',
    actionName: 'web.fetch',
  });
  const timeoutMs = readOptionalRuntimePositiveInteger({
    payload: args.payload,
    fieldName: 'timeoutMs',
    actionName: 'web.fetch',
  }) ?? DEFAULT_WEB_FETCH_TIMEOUT_MS;
  const maxBytes = readOptionalRuntimePositiveInteger({
    payload: args.payload,
    fieldName: 'maxBytes',
    actionName: 'web.fetch',
  }) ?? DEFAULT_WEB_FETCH_MAX_BYTES;
  const fetchImpl = args.fetchFn ?? fetch;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const responseWithUrl = await fetchWithRedirectLimit({
      url,
      signal: controller.signal,
      fetchFn: fetchImpl,
      maxRedirects: DEFAULT_WEB_FETCH_MAX_REDIRECTS,
    });
    if (!responseWithUrl.response.ok) {
      throw new Error(`web.fetch received upstream status ${responseWithUrl.response.status}.`);
    }

    const contentType = readResponseContentType({
      response: responseWithUrl.response,
    });
    if (!isSupportedTextContentType({ contentType })) {
      throw new Error(`web.fetch does not support content-type ${contentType || 'unknown'}.`);
    }

    const body = await readResponseTextWithLimit({
      response: responseWithUrl.response,
      maxBytes,
    });
    const parsed = parseWebFetchBody({
      contentType,
      bodyText: body.text,
    });

    return {
      url: responseWithUrl.url,
      status: responseWithUrl.response.status,
      contentType,
      title: parsed.title,
      text: parsed.text,
      truncated: body.truncated,
    };
  } catch (error) {
    if (isAbortError({ error })) {
      throw new Error(`web.fetch timed out after ${timeoutMs}ms.`);
    }
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('web.fetch failed.');
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Represents one redirected fetch completion payload.
 */
export type RedirectedFetchResult = {
  response: Response;
  url: string;
};

/**
 * Fetches one URL while enforcing a bounded redirect-follow policy.
 */
export async function fetchWithRedirectLimit(
  args: {
    url: string;
    signal: AbortSignal;
    fetchFn: typeof fetch;
    maxRedirects: number;
  },
): Promise<RedirectedFetchResult> {
  let currentUrl = args.url;
  for (let redirectCount = 0; redirectCount <= args.maxRedirects; redirectCount += 1) {
    const response = await args.fetchFn(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: args.signal,
      headers: {
        'user-agent': 'protege-web-fetch/1.0',
      },
    });
    if (!isRedirectStatus({ status: response.status })) {
      return {
        response,
        url: currentUrl,
      };
    }
    if (redirectCount === args.maxRedirects) {
      throw new Error(`web.fetch exceeded redirect limit (${args.maxRedirects}).`);
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new Error('web.fetch redirect response missing location header.');
    }
    currentUrl = new URL(location, currentUrl).toString();
  }

  throw new Error('web.fetch exceeded redirect limit.');
}

/**
 * Returns true when one HTTP status code represents redirect behavior.
 */
export function isRedirectStatus(
  args: {
    status: number;
  },
): boolean {
  return args.status === 301
    || args.status === 302
    || args.status === 303
    || args.status === 307
    || args.status === 308;
}

/**
 * Reads normalized content-type metadata from one fetch response.
 */
export function readResponseContentType(
  args: {
    response: Response;
  },
): string {
  const header = args.response.headers.get('content-type');
  if (!header) {
    return '';
  }

  return header.toLowerCase().split(';')[0]?.trim() ?? '';
}

/**
 * Returns true when one content-type is supported for readable-text extraction.
 */
export function isSupportedTextContentType(
  args: {
    contentType: string;
  },
): boolean {
  if (args.contentType.startsWith('text/')) {
    return true;
  }

  return args.contentType === 'application/xhtml+xml'
    || args.contentType === 'application/xml'
    || args.contentType === 'application/json';
}

/**
 * Reads response body text while enforcing a maximum byte budget.
 */
export async function readResponseTextWithLimit(
  args: {
    response: Response;
    maxBytes: number;
  },
): Promise<{
  text: string;
  truncated: boolean;
}> {
  const fullText = await args.response.text();
  const fullBuffer = Buffer.from(fullText, 'utf8');
  const truncated = fullBuffer.length > args.maxBytes;
  return {
    text: fullBuffer.subarray(0, args.maxBytes).toString('utf8'),
    truncated,
  };
}

/**
 * Parses one fetched body into normalized title + readable text fields.
 */
export function parseWebFetchBody(
  args: {
    contentType: string;
    bodyText: string;
  },
): {
  title: string | null;
  text: string;
} {
  if (args.contentType === 'text/html' || args.contentType === 'application/xhtml+xml') {
    const title = extractHtmlTitle({
      html: args.bodyText,
    });
    const text = extractReadableHtmlText({
      html: args.bodyText,
    });
    return {
      title,
      text,
    };
  }

  return {
    title: null,
    text: normalizeReadableText({
      text: args.bodyText,
    }),
  };
}

/**
 * Extracts one best-effort HTML title value from a document body.
 */
export function extractHtmlTitle(
  args: {
    html: string;
  },
): string | null {
  const match = args.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match || typeof match[1] !== 'string') {
    return null;
  }

  const title = normalizeReadableText({
    text: decodeBasicHtmlEntities({
      text: match[1],
    }),
  });
  return title.length > 0 ? title : null;
}

/**
 * Extracts readable text from one HTML document using lightweight tag stripping.
 */
export function extractReadableHtmlText(
  args: {
    html: string;
  },
): string {
  const withoutScripts = args.html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const withBreaks = withoutScripts
    .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const withoutTags = withBreaks.replace(/<[^>]+>/g, ' ');
  return normalizeReadableText({
    text: decodeBasicHtmlEntities({
      text: withoutTags,
    }),
  });
}

/**
 * Decodes a small set of common HTML entities for readable text output.
 */
export function decodeBasicHtmlEntities(
  args: {
    text: string;
  },
): string {
  return args.text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'');
}

/**
 * Normalizes whitespace/newlines for readable body and title text.
 */
export function normalizeReadableText(
  args: {
    text: string;
  },
): string {
  const normalizedLines = args.text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
  return normalizedLines.join('\n');
}

/**
 * Returns true when an unknown error represents request abortion.
 */
export function isAbortError(
  args: {
    error: unknown;
  },
): boolean {
  return args.error instanceof DOMException && args.error.name === 'AbortError';
}
