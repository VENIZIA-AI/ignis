import { redactSecrets } from '@/common/redact';
import util from 'node:util';

/** The placeholders `util.format` understands. `%%` is an escape, not a placeholder. */
const PLACEHOLDER_PATTERN = /%[sjdifoOc%]/g;

/**
 * How deep an object is inspected before it collapses to `[Object]`. Node's default of 2 hides
 * useful nested data (e.g. wrapped `cause`); 5 reaches it while staying bounded.
 * `APP_ENV_LOGGER_INSPECT_DEPTH` overrides with a NON-NEGATIVE number - no unlimited setting.
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
 * Formats like `util.format`, but `%s` inspects to configured depth instead of Node's hard-coded
 * `depth: 0` (no inspect option overrides that). Done per-placeholder only - widening ALL args
 * would turn `%j` into a JSON-quoted string instead of an object.
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

    return util.inspect(redactSecrets(arg), inspectOptions);
  });

  return util.formatWithOptions(inspectOptions, message, ...widened);
};
