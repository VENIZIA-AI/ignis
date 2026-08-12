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
const isRedactionEnabled = (): boolean =>
  globalThis.process?.env?.APP_ENV_LOGGER_DO_REDACT !== 'false';

type TSanitizeContext = {
  seen: WeakSet<object>;
  doRedact: boolean;
  /** Levels still allowed BELOW the current one; `Infinity` walks the whole graph. */
  depth: number;
};

const deepSanitize = (value: unknown, context: TSanitizeContext): unknown => {
  const { seen, doRedact, depth } = context;

  if (value === null || typeof value !== 'object') {
    return value;
  }

  // A Date holds its value in an internal slot, so the generic branch below - which reads Object.keys() - would flatten it to `{}`. Checked BEFORE `seen`: a Date cannot carry a cycle, and entering the set would make a second reference to the same instance read as `[Circular]`.
  if (value instanceof Date) {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return `[Binary ${(value as ArrayBufferView).byteLength ?? 0} bytes]`;
  }

  if (depth <= 0) {
    return Array.isArray(value) ? '[Array]' : '[Object]';
  }

  seen.add(value);
  const nested: TSanitizeContext = { seen, doRedact, depth: depth - 1 };

  // Error keeps name/message/stack NON-enumerable, so Object.keys() skips them and naive redaction would drop the message - reproject into a plain object carrying those fields plus its redacted enumerable own-props.
  if (value instanceof Error) {
    const source = value;
    const result: AnyObject = {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };

    for (const key of Object.keys(source)) {
      result[key] =
        doRedact && SECRET_KEY_PATTERN.test(key) ? REDACTED : deepSanitize(source[key], nested);
    }

    return result;
  }

  if (Array.isArray(value)) {
    return value.map(entry => deepSanitize(entry, nested));
  }

  const source = value;
  const result: AnyObject = {};

  for (const key of Object.keys(source)) {
    if (doRedact && SECRET_KEY_PATTERN.test(key)) {
      result[key] = REDACTED;
      continue;
    }

    result[key] = deepSanitize(source[key], nested);
  }

  return result;
};

/** Redacts every secret-looking KEY (not value shape - buffers/typed arrays are summarized, not serialized). `APP_ENV_LOGGER_DO_REDACT=false` makes this the identity function. */
export const redactSecrets = (value: unknown, seen?: WeakSet<object>): unknown => {
  if (!isRedactionEnabled()) {
    return value;
  }

  return deepSanitize(value, {
    seen: seen ?? new WeakSet<object>(),
    doRedact: true,
    depth: Infinity,
  });
};

/** Projects a value into something `JSON.stringify` can render: it answers `[Circular]` for the WHOLE payload when one cycle sits anywhere inside it, so cycles must be broken per-branch first. `depth` bounds the walk the way `util.inspect` does - a log argument may hold a live connector or request context, whose graph is effectively unbounded. The projection itself is unconditional: `APP_ENV_LOGGER_DO_REDACT=false` turns off the key masking, never the structural pass. */
export const toJsonSafe = (opts: { value: unknown; depth?: number }): unknown => {
  return deepSanitize(opts.value, {
    seen: new WeakSet<object>(),
    doRedact: isRedactionEnabled(),
    depth: opts.depth ?? Infinity,
  });
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
