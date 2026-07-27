import { AnyObject } from './types';

/** Keys whose VALUES must never reach a log line - matched case-insensitively on the key name, at any depth. */
const SECRET_KEY_PATTERN = new RegExp(
  [
    // Options-object spellings (camelCase / snake_case).
    '^(pass|password|passphrase|secret|token|apiKey|api_key|accessKey|access_key',
    '|secretKey|secret_key|privateKey|private_key|key|cert|ca|pfx|credentials',
    '|authorization|auth|jwtSecret|applicationSecret|connectionString)$',

    // Vault wire spellings (snake_case): node-vault's AppRole login/response bodies carry these exact keys, and none are matched by the anchored options list above.
    '|^(client_token|secret_id|role_id)$',

    // Any `*_token` (snake_case) or `*Token` (camelCase) key; a preceding character is required so the bare word `token` (already covered above) is not the whole match, and so ordinary words are not swallowed.
    '|_token$|[a-z0-9]token$',

    // HTTP HEADER spellings: header names are kebab-case and often `x-`-prefixed, none of which the camelCase list above matches; `vault` is included so `X-Vault-Token` (node-vault's auth header) is caught.
    '|^(x-)?(api|auth|access|secret|session|csrf|xsrf|vault)-(key|token|secret|id)$',
    '|^(cookie|set-cookie|proxy-authorization|www-authenticate)$',
  ].join(''),
  'i',
);

export const REDACTED = '[REDACTED]';

/** Kill-switch for local debugging: only the literal `false` disables redaction (fail-closed); read per call so it can be flipped at runtime. Never disable in production. */
const isRedactionEnabled = (): boolean => process.env.APP_ENV_LOGGER_DO_REDACT !== 'false';

const deepRedactSecrets = (value: unknown, seen: WeakSet<object>): unknown => {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  // Error keeps name/message/stack NON-enumerable, so Object.keys() skips them and naive redaction would drop the message - reproject into a plain object carrying those fields plus its redacted enumerable own-props.
  if (value instanceof Error) {
    const source = value;
    const result: AnyObject = {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };

    for (const key of Object.keys(source)) {
      result[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : deepRedactSecrets(source[key], seen);
    }

    return result;
  }

  if (Array.isArray(value)) {
    return value.map(entry => deepRedactSecrets(entry, seen));
  }

  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return `[Binary ${(value as ArrayBufferView).byteLength ?? 0} bytes]`;
  }

  const source = value;
  const result: AnyObject = {};

  for (const key of Object.keys(source)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      result[key] = REDACTED;
      continue;
    }

    result[key] = deepRedactSecrets(source[key], seen);
  }

  return result;
};

/** Redacts every secret-looking KEY (not value shape - buffers/typed arrays are summarized, not serialized). `APP_ENV_LOGGER_DO_REDACT=false` makes this the identity function. */
export const redactSecrets = (value: unknown, seen?: WeakSet<object>): unknown => {
  if (!isRedactionEnabled()) {
    return value;
  }

  return deepRedactSecrets(value, seen ?? new WeakSet<object>());
};

/** Strips credentials from a connection URL's authority section (`user:hunter2@host` -> `user:[REDACTED]@host`) - {@link redactSecrets} matches on KEY names and can't see them there. A value that fails to parse as a URL is returned unchanged. */
export const redactUrlCredentials = (url: string): string => {
  if (!isRedactionEnabled()) {
    return url;
  }

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
