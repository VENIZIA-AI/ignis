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

    // `%o`, `%O` and arguments with NO placeholder (`util.format` appends those) are redacted but
    // left as objects, so `util.formatWithOptions` still renders them the way that placeholder
    // means. Pre-inspecting them into a string here would make `%o` print a quoted, escaped string
    // instead of an object. Only the redaction is added; the rendering is unchanged.
    //
    // Before this, `logger.info('login failed', { password })` printed the password verbatim: the
    // redactor only ever saw `%s`, while the reference docs recommend `%o` for data objects.
    if (placeholder === undefined || placeholder === '%o' || placeholder === '%O') {
      return redactSecrets(arg);
    }

    if (placeholder !== '%s') {
      return arg;
    }

    // Inspecting an Error dumps every own property - a `jose` failure carries the whole JWT payload, a driver failure the whole query. Project it instead, onto its own line so it never trails off the end of the caller's sentence.
    if (arg instanceof Error) {
      return `\n${ErrorPrettier.format({ error: arg, inspectOptions })}`;
    }

    // Bounded to just past what `util.inspect` will actually render. `+2`, not `+1`: at exactly
    // `depth + 1` the redactor replaces the last level with a string, and inspect then prints a
    // QUOTED `'[Object]'` instead of its own bare `[Object]`.
    return util.inspect(
      redactSecrets(arg, undefined, (inspectOptions.depth ?? resolveDepth()) + 2),
      inspectOptions,
    );
  });

  return util.formatWithOptions(inspectOptions, message, ...widened);
};
