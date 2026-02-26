import type { HttpHandler } from 'msw';

import type { DeepPartial, HttpMethod, NetworkFixture } from '@tests/network/types';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { http, HttpResponse } from 'msw';

import { networkServer } from '@tests/network/server';

const FIXTURE_ROOT = join(process.cwd(), 'tests', 'fixtures', 'api');
type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

/**
 * Resolves a fixture JSON path from a fixture key.
 */
export function resolveFixturePath(
  args: {
    fixtureKey: string;
  },
): string {
  return join(FIXTURE_ROOT, `${args.fixtureKey}.json`);
}

/**
 * Parses and returns a fixture contract from disk.
 */
export function loadNetworkFixture(
  args: {
    fixtureKey: string;
  },
): NetworkFixture {
  const filePath = resolveFixturePath({ fixtureKey: args.fixtureKey });
  const fixtureText = readFileSync(filePath, 'utf8');
  return JSON.parse(fixtureText) as NetworkFixture;
}

/**
 * Creates an escaped regex-safe string from a literal path segment.
 */
export function escapeRegExp(
  args: {
    value: string;
  },
): string {
  return args.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a full-URL regex used by MSW path matching.
 */
export function buildUrlRegex(
  args: {
    request: NetworkFixture['request'];
  },
): RegExp {
  if (args.request.pathPattern) {
    const normalizedPattern = normalizePathPattern({
      pathPattern: args.request.pathPattern,
    });
    return new RegExp(`^https?://[^/]+${normalizedPattern}(?:\\?.*)?$`);
  }

  if (!args.request.path) {
    throw new Error('Fixture must define request.path or request.pathPattern.');
  }

  const escapedPath = escapeRegExp({ value: args.request.path });
  return new RegExp(`^https?://[^/]+${escapedPath}(?:\\?.*)?$`);
}

/**
 * Removes outer anchors from path patterns and ensures a leading slash.
 */
export function normalizePathPattern(
  args: {
    pathPattern: string;
  },
): string {
  const noLeadingAnchor = args.pathPattern.startsWith('^')
    ? args.pathPattern.slice(1)
    : args.pathPattern;
  const noOuterAnchors = noLeadingAnchor.endsWith('$')
    ? noLeadingAnchor.slice(0, -1)
    : noLeadingAnchor;
  return noOuterAnchors.startsWith('/') ? noOuterAnchors : `/${noOuterAnchors}`;
}

/**
 * Deeply merges fixture fields for per-test response overrides.
 */
export function deepMerge<T extends Record<string, unknown>>(
  args: {
    base: T;
    merge: DeepPartial<T>;
  },
): T {
  const output: Record<string, unknown> = { ...args.base };

  for (const key of Object.keys(args.merge)) {
    const keyTyped = key as keyof T;
    const baseValue = output[keyTyped as string];
    const mergeValue = args.merge[keyTyped];
    if (mergeValue === undefined) {
      continue;
    }

    if (isRecord({ value: baseValue }) && isRecord({ value: mergeValue })) {
      output[keyTyped as string] = deepMerge({
        base: baseValue as Record<string, unknown>,
        merge: mergeValue as DeepPartial<Record<string, unknown>>,
      });
      continue;
    }

    output[keyTyped as string] = mergeValue;
  }

  return output as T;
}

/**
 * Returns true when the value is a plain object record.
 */
export function isRecord(
  args: {
    value: unknown;
  },
): args is { value: Record<string, unknown> } {
  return typeof args.value === 'object' && args.value !== null && !Array.isArray(args.value);
}

/**
 * Registers one fixture-backed MSW handler.
 */
export function mswIntercept(
  args: {
    fixtureKey: string;
    merge?: DeepPartial<NetworkFixture>;
  },
): void {
  const fixture = loadNetworkFixture({ fixtureKey: args.fixtureKey });
  const mergedFixture = args.merge
    ? deepMerge({
        base: fixture as Record<string, unknown>,
        merge: args.merge as DeepPartial<Record<string, unknown>>,
      }) as NetworkFixture
    : fixture;

  const handler = createHandlerFromFixture({ fixture: mergedFixture });
  networkServer.use(handler);
}

/**
 * Creates an MSW handler from a fixture definition.
 */
export function createHandlerFromFixture(
  args: {
    fixture: NetworkFixture;
  },
): HttpHandler {
  const method = args.fixture.request.method.toUpperCase() as HttpMethod;
  const routeRegex = buildUrlRegex({ request: args.fixture.request });
  const methodHandler = getMethodHandler({ method });

  const responseBody = args.fixture.response.body;
  const bodyType = args.fixture.response.bodyType ?? 'json';
  const handler = methodHandler(routeRegex, () => {
    if (bodyType === 'text') {
      return new HttpResponse(String(responseBody), {
        status: args.fixture.response.status,
        headers: args.fixture.response.headers,
      });
    }

    return HttpResponse.json(responseBody as JsonValue, {
      status: args.fixture.response.status,
      headers: args.fixture.response.headers,
    });
  });

  return handler as HttpHandler;
}

/**
 * Resolves the MSW HTTP handler factory for a specific method.
 */
export function getMethodHandler(
  args: {
    method: HttpMethod;
  },
): typeof http.get {
  const handlers: Record<HttpMethod, typeof http.get> = {
    GET: http.get,
    POST: http.post,
    PUT: http.put,
    PATCH: http.patch,
    DELETE: http.delete,
    HEAD: http.head,
    OPTIONS: http.options,
  };

  return handlers[args.method];
}
