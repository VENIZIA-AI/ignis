import { redactSecrets, toJsonSafe } from '@/common/redact';
import util from 'node:util';
import { ErrorPrettier } from './error-prettier';

/** The placeholders `util.format` understands. `%%` is an escape, not a placeholder. */
const PLACEHOLDER_PATTERN = /%[sjdifoOc%]/g;

/** How deep an object is inspected before it collapses to `[Object]`: Node's default of 2 hides nested data (e.g. wrapped `cause`), 5 reaches it while staying bounded. `APP_ENV_LOGGER_INSPECT_DEPTH` overrides with a NON-NEGATIVE number - no unlimited setting. */
const DEFAULT_INSPECT_DEPTH = 5;

const resolveDepth = (): number => {
  const configured = process.env.APP_ENV_LOGGER_INSPECT_DEPTH;

  // Not `int()`: it answers 0 for an ABSENT value, which would silently mean "depth 0" - the one setting that hides everything.
  if (configured === undefined || configured.trim() === '') {
    return DEFAULT_INSPECT_DEPTH;
  }

  const parsed = Number.parseInt(configured, 10);

  // A negative or unparseable value is a misconfiguration, not a request: fall back rather than hand `util.inspect` a depth it reads as "unlimited".
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

/** Formats like `util.format`, but `%s` inspects to configured depth instead of Node's hard-coded `depth: 0` (no inspect option overrides that), and `%j` is projected into a JSON-safe shape first. Per-placeholder only - handing `%j` the widened STRING would emit a JSON-quoted inspect dump instead of an object. */
export const formatLogMessage = (opts: {
  message: string;
  args: Array<unknown>;
  inspectOptions?: util.InspectOptions;
}): string => {
  const { message, args, inspectOptions = buildInspectOptions() } = opts;

  const placeholders = (message.match(PLACEHOLDER_PATTERN) ?? []).filter(token => token !== '%%');

  const widened = args.map((arg, index) => {
    const placeholder = placeholders[index];
    const isInspectable = typeof arg === 'object' && arg !== null;

    if (!isInspectable) {
      return arg;
    }

    // `%j` runs JSON.stringify, which answers `[Circular]` for the WHOLE argument when one cycle sits anywhere inside it - a transaction handle in the payload wipes out every other field. It also has no notion of secret keys, and no depth limit of its own. Project the value first, under the same depth cap `%s` gets.
    if (placeholder === '%j') {
      return toJsonSafe({ value: arg, depth: inspectOptions.depth ?? resolveDepth() });
    }

    if (placeholder !== '%s') {
      return arg;
    }

    // Inspecting an Error dumps every own property - a `jose` failure carries the whole JWT payload, a driver failure the whole query. Project it instead, onto its own line so it never trails off the end of the caller's sentence.
    if (arg instanceof Error) {
      return `\n${ErrorPrettier.format({ error: arg, inspectOptions })}`;
    }

    return util.inspect(redactSecrets(arg), inspectOptions);
  });

  return util.formatWithOptions(inspectOptions, message, ...widened);
};
