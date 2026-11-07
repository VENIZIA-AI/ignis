/** A caller's value made safe to put inside a log line or an error message. Pure string work, no node import, so it ships on `/core`. */
export class EchoUtility {
  /**
   * What can forge or hide part of a line: C0 controls (a line break, an escape sequence), DEL and C1 controls
   * (U+0085 is a line break to some viewers), lone surrogates, the soft hyphen, the Arabic letter mark, the
   * Mongolian vowel separator, the zero-width and directional marks (U+200B-U+200F), the line and paragraph
   * separators and every bidirectional override and isolate (U+2028-U+202E, U+2060-U+206F), the byte order mark
   * (U+FEFF), the interlinear annotation marks and the Unicode tag characters. The `u` flag makes the surrogate
   * range match a LONE surrogate only; a valid pair is one character and stays.
   */
  private static readonly UNSAFE_CHARACTERS =
    /[\p{Cc}\p{Cs}\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb\u{e0000}-\u{e007f}]/gu;

  /** A value JSON cannot take (a cycle, a `BigInt`) is named by its type, never thrown over: a log line must not fail. */
  private static stringify(opts: { value: unknown }): string {
    const { value } = opts;

    try {
      return JSON.stringify(value) ?? `<${typeof value}>`;
    } catch {
      return `<${typeof value}>`;
    }
  }

  private static escapeUnsafe(opts: { text: string }): string {
    return opts.text.replace(EchoUtility.UNSAFE_CHARACTERS, (character) => {
      const code = character.codePointAt(0) ?? 0;

      return code > 0xffff
        ? `\\u{${code.toString(16)}}`
        : `\\u${code.toString(16).padStart(4, '0')}`;
    });
  }

  /**
   * The value as one quoted, single-line token: a string becomes `"a.txt"`, anything else its JSON. Every character
   * that can break a line or reorder what a reader sees becomes a `\uXXXX` (or `\u{XXXXX}`) escape.
   *
   * Use it for every caller-chosen value that reaches a log line (a key, a bucket, a file name, a path): hand the
   * result to a `%s`, never to a template that then adds the quotes again.
   */
  static toSafeEcho(opts: { value: unknown }): string {
    return EchoUtility.escapeUnsafe({ text: EchoUtility.stringify(opts) });
  }

  /**
   * The value with every unsafe character escaped and nothing else changed: no quotes, and `"` and `\` stay.
   * For a caller's value inside a message that is read as text (a thrown error's message, which reaches the
   * caller and the error log), where an ordinary name must read exactly as it did before. A value that is not a
   * string is written as `toSafeEcho` writes it.
   */
  static toSafeText(opts: { value: unknown }): string {
    const { value } = opts;

    if (typeof value !== 'string') {
      return EchoUtility.toSafeEcho({ value });
    }

    return EchoUtility.escapeUnsafe({ text: value });
  }
}
