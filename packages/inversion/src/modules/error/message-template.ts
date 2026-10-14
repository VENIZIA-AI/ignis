/** `%{key}`: a placeholder a catalog message carries for one of its args. */
const PLACEHOLDER_PATTERN = /%\{(\w+)\}/g;

/**
 * Fills a catalog template - `Only %{available} left of %{sku}` - from its args. The error keeps the
 * template in `message` and `normalized.text`, so a log redacts values by key and a client can
 * translate `code` + `args`; this is where a reader that wants the sentence gets it.
 */
export class MessageTemplate {
  /**
   * Each `%{key}` replaced by `String(args[key])`. A key with no arg (absent or `undefined`) stays as
   * written and is listed in `missing`. Never throws: it runs inside the last-resort error handler.
   */
  static render(opts: { text: string; args: unknown }): { text: string; missing: Array<string> } {
    const { text, args } = opts;
    const values = typeof args === 'object' && args !== null ? args : {};
    const missing = new Set<string>();

    const rendered = text.replace(PLACEHOLDER_PATTERN, (placeholder, key: string) => {
      const value: unknown = Object.hasOwn(values, key) ? Reflect.get(values, key) : undefined;

      if (value === undefined) {
        missing.add(key);
        return placeholder;
      }

      try {
        return String(value);
      } catch {
        // A null-prototype object has no `toString`; leave its placeholder rather than fail.
        return placeholder;
      }
    });

    return { text: rendered, missing: [...missing] };
  }
}
