import { AnyObject } from './types';

/**
 * Keys whose VALUES must never reach a log line, a log aggregator or a crash report. Matched
 * case-insensitively on the key name, at any depth.
 */
const SECRET_KEY_PATTERN = new RegExp(
  [
    // Options-object spellings (camelCase / snake_case).
    '^(pass|password|passphrase|secret|token|apiKey|api_key|accessKey|access_key',
    '|secretKey|secret_key|privateKey|private_key|key|cert|ca|pfx|credentials',
    '|authorization|auth|jwtSecret|applicationSecret|connectionString)$',

    // Vault wire spellings (snake_case). node-vault's AppRole login/response bodies carry these
    // exact keys; `secret_id`/`role_id` are the AppRole credential pair and `client_token` is the
    // minted session token. None are matched by the anchored options list above.
    '|^(client_token|secret_id|role_id)$',

    // Any `*_token` (snake_case) or `*Token` (camelCase) key - access_token, refresh_token,
    // vaultToken, ... A preceding character is required so the bare word `token` (already covered
    // above) is not the whole match, and so ordinary words are not swallowed.
    '|_token$|[a-z0-9]token$',

    // HTTP HEADER spellings. A header set is logged on every outbound request, and its names are
    // kebab-case and often `x-`-prefixed - none of which the camelCase list above matches. `vault`
    // is included so `X-Vault-Token` (node-vault's auth header) is caught.
    '|^(x-)?(api|auth|access|secret|session|csrf|xsrf|vault)-(key|token|secret|id)$',
    '|^(cookie|set-cookie|proxy-authorization|www-authenticate)$',
  ].join(''),
  'i',
);

export const REDACTED = '[REDACTED]';

/**
 * Returns a copy of `value` with every secret-looking key replaced by `[REDACTED]`, so an options
 * object can be logged without spilling a TLS private key, an SMTP password or a bearer token.
 *
 * Redaction is by KEY NAME, not by value shape: a secret is whatever a caller named like one, and
 * that is the only signal available at this layer. Buffers and typed arrays are summarized rather
 * than serialized - a `key: Buffer` is still a private key.
 */
export const redactSecrets = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  // An Error keeps `name`/`message`/`stack` as NON-enumerable, so `Object.keys()` skips them and a
  // naive redaction would DROP the very message the log line is about. Reproject the error into a
  // plain object that STILL carries those fields, plus its redacted enumerable own-props
  // (`config`/`response`/... where a nested `X-Vault-Token` or `secret_id` becomes [REDACTED]).
  if (value instanceof Error) {
    const source = value as unknown as AnyObject;
    const result: AnyObject = {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
    for (const key of Object.keys(source)) {
      result[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redactSecrets(source[key], seen);
    }
    return result;
  }

  if (Array.isArray(value)) {
    return value.map(entry => redactSecrets(entry, seen));
  }

  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return `[Binary ${(value as ArrayBufferView).byteLength ?? 0} bytes]`;
  }

  const source = value as AnyObject;
  const result: AnyObject = {};

  for (const key of Object.keys(source)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      result[key] = REDACTED;
      continue;
    }

    result[key] = redactSecrets(source[key], seen);
  }

  return result;
};

/**
 * Strips the credentials out of a connection URL: `mqtts://user:hunter2@broker:8883` becomes
 * `mqtts://user:[REDACTED]@broker:8883`. A broker/database URL is routinely logged at boot, and the
 * password sits in the authority section where {@link redactSecrets} - which matches on KEY names -
 * cannot see it.
 *
 * A value that does not parse as a URL is returned unchanged: it carries no authority section, so
 * there is nothing to strip, and blanking it would hide the very thing the log line is about.
 */
export const redactUrlCredentials = (url: string): string => {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (!parsed.password) {
    return url;
  }

  parsed.password = REDACTED;
  return decodeURIComponent(parsed.toString());
};
