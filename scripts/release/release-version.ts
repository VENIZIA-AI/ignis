import type { TReleaseMode } from './release-constants';

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/**
 * The version `npm version <mode>` gives a package that is at `from` (no `--preid`). The release loop uses it to
 * tell a package this plan released from one that only has some higher version: only the exact target counts.
 */
export class ReleaseVersion {
  static next(opts: { from: string; mode: TReleaseMode }): string {
    const { from, mode } = opts;
    const match = VERSION.exec(from);
    if (!match) {
      throw new Error(`'${from}' is not a semver version`);
    }

    const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const pre = match[4] === undefined ? [] : match[4].split('.');
    const core = (parts: number[]) => parts.join('.');

    switch (mode) {
      case 'patch':
        return core([major, minor, pre.length === 0 ? patch + 1 : patch]);
      case 'minor':
        return core([major, patch !== 0 || pre.length === 0 ? minor + 1 : minor, 0]);
      case 'major':
        return core([minor !== 0 || patch !== 0 || pre.length === 0 ? major + 1 : major, 0, 0]);
      case 'prepatch':
        return `${core([major, minor, patch + 1])}-0`;
      case 'preminor':
        return `${core([major, minor + 1, 0])}-0`;
      case 'premajor':
        return `${core([major + 1, 0, 0])}-0`;
      case 'prerelease':
        return pre.length === 0
          ? `${core([major, minor, patch + 1])}-0`
          : `${core([major, minor, patch])}-${this.bumpPre({ pre })}`;
      default:
        throw new Error(`'${mode}' is not an npm version mode`);
    }
  }

  /** Raises the last numeric identifier; a prerelease with none gets a `0` appended (`rc` becomes `rc.0`). */
  private static bumpPre(opts: { pre: string[] }): string {
    const parts = [...opts.pre];
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      if (/^\d+$/.test(parts[index])) {
        parts[index] = String(Number(parts[index]) + 1);
        return parts.join('.');
      }
    }

    return [...parts, '0'].join('.');
  }
}
