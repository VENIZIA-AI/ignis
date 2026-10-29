import { ReleaseOrder } from './release-constants';

/** One package of a release: its folder name under `packages/` and the version it had when the plan was made. */
export interface IPlanEntry {
  name: string;
  from: string;
}

const ENTRY = /^([a-z][a-z-]*)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

/**
 * The `plan` input of the release workflow: `name@from,name@from`. It is computed by `release.ts` and
 * re-checked here, by the workflow, because a dispatch input is text anybody with write access can type.
 */
export class ReleasePlanInput {
  /** The entries in release order, whatever order they came in. Throws on anything it cannot vouch for. */
  static parse(opts: { text: string }): IPlanEntry[] {
    const parts = opts.text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      throw new Error('the plan is empty: expected name@version[,name@version...]');
    }

    const entries = new Map<string, IPlanEntry>();
    for (const part of parts) {
      const match = ENTRY.exec(part);
      if (!match) {
        throw new Error(`'${part}' is not name@version (a package folder and a semver)`);
      }

      const [, name, from] = match;
      if (!ReleaseOrder.isKnown(name)) {
        throw new Error(`'${name}' is not a package of this repository`);
      }
      if (entries.has(name)) {
        throw new Error(`'${name}' appears twice in the plan`);
      }
      entries.set(name, { name, from });
    }

    return ReleaseOrder.sort({ names: [...entries.keys()] }).map((name) => entries.get(name)!);
  }

  static format(opts: { entries: ReadonlyArray<IPlanEntry> }): string {
    return opts.entries.map((entry) => `${entry.name}@${entry.from}`).join(',');
  }
}
