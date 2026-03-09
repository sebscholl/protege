/**
 * Supported HTTP method names for fixture matching.
 */
export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

/**
 * Request-matching metadata loaded from fixture definitions.
 */
export type NetworkFixtureRequest = {
  method: HttpMethod;
  path?: string;
  pathPattern?: string;
};

/**
 * HTTP response payload metadata loaded from fixture definitions.
 */
export type NetworkFixtureResponse = {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
  bodyType?: 'json' | 'text';
};

/**
 * Full fixture contract used by MSW interception helpers.
 */
export type NetworkFixture = {
  request: NetworkFixtureRequest;
  response: NetworkFixtureResponse;
  meta?: {
    service?: string;
    name?: string;
  };
};

/**
 * Deep partial helper used for per-test fixture merge overrides.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K];
};
