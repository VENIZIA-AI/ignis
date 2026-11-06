import { type AnyObject } from './types';

/** Keys whose VALUES must never reach a log line - matched case-insensitively on the key name, at any depth. */
const SECRET_KEY_PATTERN = new RegExp(
  [
    // Options-object spellings (camelCase / snake_case).
    '^(pass|password|passphrase|secret|token|apiKey|api_key|accessKey|access_key',
    '|secretKey|secret_key|privateKey|private_key|key|cert|ca|pfx|credential|credentials',
    '|authorization|auth|jwtSecret|applicationSecret|connectionString)$',

    // Vault wire spellings (snake_case): node-vault's AppRole login/response bodies carry these exact keys, and none are matched by the anchored options list above.
    '|^(client_token|secret_id|role_id)$',

    // Any `*_token` (snake_case) or `*Token` (camelCase) key; a preceding character is required so the bare word `token` (already covered above) is not the whole match, and so ordinary words are not swallowed.
    '|_token$|[a-z0-9]token$',

    // The `*Secret` counterpart the `*Token` rule always lacked. `clientSecret` / `client_secret` is the RFC 6749 parameter name and a live field on the search connector's model options, and `webhookSecret` is the standard spelling everywhere; none of them matched the anchored list above.
    '|_secret$|[a-z0-9]secret$',

    // Connection descriptors: `connectionString` was anchored above but its snake_case twin was not, and `dsn` is the third common spelling for the same thing.
    '|^(connection_string|dsn|database_url|databaseUrl)$',

    // Any `*_credential` / `*Credential` key, singular or plural - `dbCredential`, `api_credentials`. The bare words are anchored above; this catches the prefixed forms, the way the `*Secret` rule does.
    '|_credentials?$|[a-z0-9]credentials?$',

    // Any `*_password` / `*Password` key - `dbPassword`, `admin_password`. The bare word is anchored above; this catches the prefixed forms.
    '|_password$|[a-z0-9]password$',

    // HTTP HEADER spellings: header names are kebab-case and often `x-`-prefixed, none of which the camelCase list above matches; `vault` is included so `X-Vault-Token` (node-vault's auth header) is caught.
    '|^(x-)?(api|auth|access|secret|session|csrf|xsrf|vault)-(key|token|secret|id)$',
    '|^(cookie|set-cookie|proxy-authorization|www-authenticate)$',

    // Named secrets that no suffix rule reaches. An explicit list, never a blanket `*Key` or `code`: those would mask
    // `primaryKey`, `cacheKey` and every status `code`. Cloud and signing keys, session and one-time values, signatures,
    // card and national-id numbers, and the kebab spellings of tokens and secrets (the suffix rules above need a letter or
    // an underscore before the word).
    '|^(secret_?access_?key|aws_?secret_?access_?key|signing_?key|encryption_?key|master_?key|hmac_?key|account_?key|storage_?key|license_?key|reset_?key|reset_?code|verification_?code|authorization_?code|auth_?code)$',
    '|^(jwt|session_?id|sid|signature|sig|passwd|pwd|passcode|pass_phrase|secret_?answer|otp|totp|cvv|cvc|card_?number|ssn|national_?id)$',
    '|^(redis_?url|mongo_?uri|mongo_?url|webhook_?url|private_?key_?pem|password_?hash|mfa_?code|otp_?code|x_?api_?key)$',
    '|^(api_?keys|refresh_?tokens|access_?tokens|secrets|tokens)$',
    '|^(x-amz-signature|x-amz-security-token|x-amz-credential)$',
    '|^(id|refresh|access|bearer|auth|api|session|csrf|xsrf)-token$',
    '|^(client|api|app|webhook)-secret$|^(private|signing|secret|api|access|encryption)-key$',
  ].join(''),
  'i',
);

/** The placeholder that replaces a secret value in redacted output. */
export const REDACTED = '[REDACTED]';

/**
 * `://user:password@host`: the password of a url's userinfo, wherever the url sits inside a string. Anchored on `://`
 * (not on the scheme, whose letters a pattern would rescan from every start) and every run is bounded, so the cost is
 * linear in the string. The password runs to the LAST `@` before a space or slash, so one that holds an `@` is whole.
 */
const URL_USERINFO_PATTERN = /(:\/\/[^\s/:@]{0,256}):[^\s/]{1,256}@/g;

/** `://token@host`: a userinfo with no password is the credential itself (`https://<token>@github.com`). */
const URL_USER_ONLY_PATTERN = /:\/\/[^\s/:@]{1,256}@/g;

/** `Bearer abc...` and `Basic abc...` credentials, as an `Authorization` header or a message quotes them. */
const AUTH_SCHEME_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;

/** A credential-like `name=value` after a query, fragment, list or space: `?access_token=...`, `#id_token=...`, `, password=...`. */
const QUERY_CREDENTIAL_PATTERN =
  /([?&;,#\s])(access_token|refresh_token|id_token|token|api_key|apikey|x-api-key|key|auth|password|passwd|pwd|secret|client_secret|signature|sig|x-amz-signature|x-amz-security-token|jwt|session_id|sessionid|code)=([^&\s#,)]*)/gi;

/** A string with the credentials it carries masked: a connection url's password, a bearer token, a credential query parameter. */
const scrubString = (value: string): string => {
  if (!value.includes('@') && !value.includes('=') && !/bearer|basic/i.test(value)) {
    return value;
  }

  return value
    .replace(URL_USERINFO_PATTERN, `$1:${'[REDACTED]'}@`)
    .replace(URL_USER_ONLY_PATTERN, `://${'[REDACTED]'}@`)
    .replace(AUTH_SCHEME_PATTERN, `$1 ${'[REDACTED]'}`)
    .replace(QUERY_CREDENTIAL_PATTERN, `$1$2=${'[REDACTED]'}`);
};

/** Kill-switch for local debugging: only the literal `false` disables redaction (fail-closed); read per call so it can be flipped at runtime. Never disable in production. `force` is the caller opting out of the switch: it always masks. */
const isRedactionEnabled = (force?: boolean): boolean =>
  force === true || globalThis.process?.env?.APP_ENV_LOGGER_DO_REDACT !== 'false';

/** Longest string a log line carries whole. `APP_ENV_LOGGER_MAX_STRING_LENGTH=0` turns capping off. */
const DEFAULT_MAX_STRING_LENGTH = 2048;

const resolveMaxStringLength = (): number => {
  const configured = Number(globalThis.process?.env?.APP_ENV_LOGGER_MAX_STRING_LENGTH);

  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_MAX_STRING_LENGTH;
};

/**
 * Keys whose value is long BY NATURE and useless truncated. A stack trace is the whole reason you
 * are reading the line.
 */
const UNCAPPED_KEYS = new Set(['stack', 'stacktrace', 'stack_trace']);

/**
 * Caps a long string, keeping the ORIGINAL LENGTH in the marker - that number is what tells you the
 * payload was a 300 KB image rather than a truncated sentence.
 *
 * A base64 body is the case this exists for: one `data:image/png;base64,...` field turns a request
 * log into hundreds of kilobytes, and nothing about it is readable.
 */
const capString = (opts: { value: string; key?: string; limit: number }): string => {
  const { value, key, limit } = opts;

  if (limit === 0 || value.length <= limit || (key && UNCAPPED_KEYS.has(key.toLowerCase()))) {
    return value;
  }

  return `${value.slice(0, limit)}... [truncated, ${value.length} chars total]`;
};

type TSanitizeContext = {
  seen: WeakSet<object>;
  doRedact: boolean;
  /** Levels still allowed BELOW the current one; `Infinity` walks the whole graph. */
  depth: number;
  /** Longest string kept whole; 0 keeps every string. */
  maxStringLength: number;
  /** The key this value was found under, so a stack trace can be exempted from capping. */
  key?: string;
};

const deepSanitize = (value: unknown, context: TSanitizeContext): unknown => {
  const { seen, doRedact, depth } = context;

  if (typeof value === 'string') {
    const text = doRedact ? scrubString(value) : value;

    return capString({ value: text, key: context.key, limit: context.maxStringLength });
  }

  // A function is not data, and an own `toJSON` on an object would run after this walk, inside `JSON.stringify`, and
  // hand back keys the walk never saw. Naming it keeps the redacted copy free of code.
  if (typeof value === 'function') {
    return '[Function]';
  }

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
  const nested: TSanitizeContext = {
    seen,
    doRedact,
    depth: depth - 1,
    maxStringLength: context.maxStringLength,
  };

  // Error keeps name/message/stack NON-enumerable, so Object.keys() skips them and naive redaction would drop the message - reproject into a plain object carrying those fields plus its redacted enumerable own-props.
  if (value instanceof Error) {
    const source = value;
    const result: AnyObject = {
      name: value.name,
      message: doRedact ? scrubString(value.message) : value.message,
      stack: doRedact && value.stack ? scrubString(value.stack) : value.stack,
    };

    for (const [key, entry] of Object.entries(source)) {
      result[key] =
        doRedact && SECRET_KEY_PATTERN.test(key)
          ? REDACTED
          : deepSanitize(entry, { ...nested, key });
    }

    return result;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => deepSanitize(entry, nested));
  }

  const source = value;
  const result: AnyObject = {};

  for (const [key, entry] of Object.entries(source)) {
    if (doRedact && SECRET_KEY_PATTERN.test(key)) {
      result[key] = REDACTED;
      continue;
    }

    result[key] = deepSanitize(entry, { ...nested, key });
  }

  return result;
};

/** Makes a log argument safe to print: masks secret-looking keys, breaks cycles, caps long strings and strips URL credentials. `APP_ENV_LOGGER_DO_REDACT=false` turns off the key masking only. */
export class RedactUtility {
  /**
   * Redacts every secret-looking KEY (not value shape - buffers/typed arrays are summarized, not
   * serialized). `APP_ENV_LOGGER_DO_REDACT=false` makes this the identity function.
   *
   * `depth` bounds the walk, exactly as {@link RedactUtility.toJsonSafe} already does. It defaults to
   * `Infinity` for callers that really do want the whole graph, but the logger passes its own bound:
   * rendering only inspects a handful of levels, so walking to `Infinity` did work whose result was
   * thrown away - 12x on a deep graph, and a `RangeError` on a very deep chain.
   *
   * `force: true` masks secret-looking KEYS even when `APP_ENV_LOGGER_DO_REDACT=false`. The result is still the
   * log-shaped copy: long strings are capped, a second reference to one object reads `[Circular]`, binary is
   * summarized, and a key is masked by name only (a card number under `number` is not). It is not a faithful
   * redacted document. The logger never sets it.
   */
  static redactSecrets(opts: {
    value: unknown;
    seen?: WeakSet<object>;
    depth?: number;
    force?: boolean;
  }): unknown {
    const { value, seen, depth = Infinity, force } = opts;

    if (!isRedactionEnabled(force)) {
      return value;
    }

    return deepSanitize(value, {
      seen: seen ?? new WeakSet<object>(),
      doRedact: true,
      depth,
      maxStringLength: resolveMaxStringLength(),
    });
  }

  /** Masks the credentials a plain string carries (a url's password, a bearer token, credential query parameters). For a log line's string argument; objects go through {@link RedactUtility.redactSecrets}. `force: true` scrubs even when `APP_ENV_LOGGER_DO_REDACT=false`. */
  static scrubText(opts: { value: string; force?: boolean }): string {
    return isRedactionEnabled(opts.force) ? scrubString(opts.value) : opts.value;
  }

  /** Projects a value into something `JSON.stringify` can render: it answers `[Circular]` for the WHOLE payload when one cycle sits anywhere inside it, so cycles must be broken per-branch first. `depth` bounds the walk the way `util.inspect` does - a log argument may hold a live connector or request context, whose graph is effectively unbounded. The projection itself is unconditional: `APP_ENV_LOGGER_DO_REDACT=false` turns off the key masking, never the structural pass. `force: true` keeps the key masking on whatever the switch says; the projection stays lossy, as in {@link RedactUtility.redactSecrets}. */
  static toJsonSafe(opts: { value: unknown; depth?: number; force?: boolean }): unknown {
    return deepSanitize(opts.value, {
      seen: new WeakSet<object>(),
      doRedact: isRedactionEnabled(opts.force),
      depth: opts.depth ?? Infinity,
      // Capping is STRUCTURAL, like the projection itself: turning redaction off is about key masking,
      // never about letting a 300 KB base64 field through.
      maxStringLength: resolveMaxStringLength(),
    });
  }

  /** Strips credentials from a connection URL's authority section (`user:hunter2@host` -> `user:[REDACTED]@host`) - {@link RedactUtility.redactSecrets} matches on KEY names and can't see them there. A value that fails to parse as a URL is returned unchanged. `force: true` strips even when `APP_ENV_LOGGER_DO_REDACT=false`. */
  static redactUrlCredentials(opts: { url: string; force?: boolean }): string {
    const { url, force } = opts;

    if (!isRedactionEnabled(force)) {
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
  }
}
