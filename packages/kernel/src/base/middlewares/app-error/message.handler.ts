const PLACEHOLDER_PATTERN = /%\{(\w+)\}/g;

/**
 * Fills each `%{key}` of a catalog template with `String(args[key])`, for the response `message`.
 * `normalized.text` stays the template - a client translating `code` + `args` needs it raw - and so
 * does `Error.message`, so the log keeps its args under key-based redaction instead of inlining them.
 *
 * A key with no arg (absent or `undefined`) stays as written and is returned in `missing`, so the
 * caller can name it outside production. Never throws: it runs inside the last-resort error handler.
 */
export const renderMessageTemplate = (opts: {
  text: string;
  args: unknown;
}): { text: string; missing: Array<string> } => {
  const { text, args } = opts;
  const values = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {};
  const missing = new Set<string>();

  const rendered = text.replace(PLACEHOLDER_PATTERN, (placeholder, key: string) => {
    const value = Object.hasOwn(values, key) ? values[key] : undefined;

    if (value === undefined) {
      missing.add(key);
      return placeholder;
    }

    try {
      return String(value);
    } catch {
      // A null-prototype object has no `toString`; leave its placeholder rather than fail the response.
      return placeholder;
    }
  });

  return { text: rendered, missing: [...missing] };
};
