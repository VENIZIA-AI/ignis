/**
 * The text of a version folder's `log.md` as the stamp reads and writes it: pure functions, so the plan job (which
 * dry-runs the stamp), the stamp itself and the merge-back (which resolves a conflict on the stamp line) share one
 * rule and no module imports another to get it.
 */
export class ReleaseStampConstants {
  static readonly VERSION = /^\d+\.\d+\.\d+$/;
  static readonly DATE = /^\d{4}-\d{2}-\d{2}$/;
  static readonly FRONT_MATTER = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n)/;
  static readonly RELEASED = /^released:\s*(.*?)\s*$/m;
  static readonly RELEASED_LINE = /^released:.*(?:\r?\n|$)/m;
  static readonly USAGE = 'stamp-release: --version <X.Y.Z> --date <YYYY-MM-DD>';
}

export class ReleaseStampText {
  /**
   * `text` with `released: <date>` as the last line of its frontmatter. `undefined` when it already says that date
   * (nothing to write); an error when it says another, or has no frontmatter to put the line in.
   */
  static stamped(opts: { text: string; date: string }): string | undefined {
    const matched = ReleaseStampConstants.FRONT_MATTER.exec(opts.text);

    if (matched === null) {
      throw new Error('log.md has no frontmatter to write released: into');
    }

    const existing = ReleaseStampConstants.RELEASED.exec(matched[2])?.[1];

    if (existing !== undefined) {
      if (existing === opts.date) {
        return undefined;
      }

      throw new Error(`log.md already says released: ${existing}; a released folder is frozen`);
    }

    const lineBreak = matched[1].endsWith('\r\n') ? '\r\n' : '\n';

    return `${matched[1]}${matched[2]}${lineBreak}released: ${opts.date}${matched[3]}${opts.text.slice(matched[0].length)}`;
  }

  /** The date the frontmatter of `text` says it was released on; `undefined` when it says none (the body is not read). */
  static releasedOf(opts: { text: string }): string | undefined {
    const matched = ReleaseStampConstants.FRONT_MATTER.exec(opts.text);

    return matched === null
      ? undefined
      : ReleaseStampConstants.RELEASED.exec(matched[2])?.[1] || undefined;
  }

  /** `text` without the `released:` line of its frontmatter; unchanged when it has none. */
  static withoutReleased(opts: { text: string }): string {
    const matched = ReleaseStampConstants.FRONT_MATTER.exec(opts.text);

    if (matched === null) {
      return opts.text;
    }

    const lineBreak = matched[1].endsWith('\r\n') ? '\r\n' : '\n';
    const kept = matched[2]
      .split(/\r?\n/)
      .filter((line) => !/^released:/.test(line))
      .join(lineBreak);

    return `${matched[1]}${kept}${matched[3]}${opts.text.slice(matched[0].length)}`;
  }

  /**
   * Why the stamp cannot be written into `text`, or `undefined` when it can: no frontmatter, or already released.
   * `healing` is a run that continues one which already dated the folder: a date there is accepted.
   */
  static problemOf(opts: { text: string; healing: boolean }): string | undefined {
    if (ReleaseStampConstants.FRONT_MATTER.exec(opts.text) === null) {
      return 'has no frontmatter to write released: into';
    }

    const released = ReleaseStampText.releasedOf({ text: opts.text });

    return !opts.healing && released !== undefined
      ? `already says released: ${released}; a stable is released once`
      : undefined;
  }
}
