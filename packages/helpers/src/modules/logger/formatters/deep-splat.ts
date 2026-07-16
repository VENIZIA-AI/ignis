import util from 'node:util';
import winston from 'winston';
import { redactSecrets } from '@/common/redact';
import { AnyType } from '@/common/types';

/** Winston stashes the extra arguments of `logger.error(msg, ...args)` under this well-known key. */
const SPLAT = Symbol.for('splat');

/** The placeholders `util.format` understands. `%%` is an escape, not a placeholder. */
const PLACEHOLDER_PATTERN = /%[sjdifoOc%]/g;

/**
 * How deep an object is inspected before it collapses to `[Object]`.
 *
 * Node's default of 2 hides the part you opened the log for (`extra`, a wrapped `cause`, a driver's
 * payload); unbounded depth would let one object graph flood a line. 5 reaches the values that carry
 * the diagnosis and stays bounded.
 *
 * `APP_ENV_LOGGER_INSPECT_DEPTH` overrides it with a NON-NEGATIVE number. There is no unlimited
 * setting: depth is always a finite number.
 */
const DEFAULT_INSPECT_DEPTH = 5;

const resolveDepth = (): number => {
  const configured = process.env.APP_ENV_LOGGER_INSPECT_DEPTH;

  // Not `int()`: it answers 0 for an ABSENT value, which would silently mean "depth 0" - the one
  // setting that hides everything.
  if (configured === undefined || configured.trim() === '') {
    return DEFAULT_INSPECT_DEPTH;
  }

  const parsed = Number.parseInt(configured, 10);

  // A negative or unparseable value is a misconfiguration, not a request: fall back rather than hand
  // `util.inspect` a depth it reads as "unlimited".
  if (Number.isNaN(parsed) || parsed < 0) {
    return DEFAULT_INSPECT_DEPTH;
  }

  return parsed;
};

const buildInspectOptions = (): util.InspectOptions => {
  return {
    depth: resolveDepth(),
    maxArrayLength: null,
    maxStringLength: null,
    breakLength: Infinity,
  };
};

/**
 * Formats a log message the way `util.format` does - except that an object passed to `%s` is
 * inspected {@link DEFAULT_INSPECT_DEPTH} levels deep instead of Node's hard-coded 0.
 *
 * Node forces `depth: 0` on `%s` (see `formatWithOptionsInternal`), which no inspect option can
 * override: `logger.error('Error: %s', error)` therefore prints `extra: [Object]` and drops the
 * nested `cause` of every wrapped driver error. Pre-inspecting the object into a string first is the
 * only way to widen it, and it must be done per-placeholder: doing it to ALL arguments would turn
 * `%j` into a JSON-quoted string instead of an object.
 */
export const formatLogMessage = (opts: {
  message: string;
  args: Array<unknown>;
  inspectOptions?: util.InspectOptions;
}): string => {
  const { message, args, inspectOptions = buildInspectOptions() } = opts;

  const placeholders = (message.match(PLACEHOLDER_PATTERN) ?? []).filter(token => token !== '%%');

  const widened = args.map((arg, index) => {
    const isStringPlaceholder = placeholders[index] === '%s';
    const isInspectable = typeof arg === 'object' && arg !== null;

    if (!isStringPlaceholder || !isInspectable) {
      return arg;
    }

    // Redact before inspecting: any object deep-inspected into a log line (a node-vault AxiosError
    // carrying a live `X-Vault-Token`, a driver payload with a password) is stripped of its secret
    // KEYS here. `redactSecrets` copies non-secret fields through unchanged, so the diagnosis the
    // line was opened for still renders at full depth.
    return util.inspect(redactSecrets(arg), inspectOptions);
  });

  return util.formatWithOptions(inspectOptions, message, ...widened);
};

/**
 * Drop-in replacement for `winston.format.splat()` that formats through {@link formatLogMessage}.
 * Every transport reads `info.message`, so widening it here widens console, file and dgram at once.
 */
export const deepSplat = winston.format(info => {
  const args = (info as AnyType)[SPLAT] as Array<unknown> | undefined;

  if (!args?.length || typeof info.message !== 'string') {
    return info;
  }

  info.message = formatLogMessage({ message: info.message, args });
  return info;
});
