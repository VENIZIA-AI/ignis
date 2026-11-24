/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The newest prerelease of each version line, from the release tags of the repository, read at build time with no network.
 * A version page of a line still in progress says which prerelease to install; the tag is the record that the release
 * finished (the commit that bumps a package.json is pushed before its tag, and a release can stop between them).
 *
 * The tag layout and the packages come from the project's committed descriptor, `.agents/atlas.manifest.json`
 * (`release.tagPattern`, `release.legacyTagPatterns`, `packages`), the same one atlas reads, so nothing is named here per repository.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A release tag and the date it was made, `YYYY-MM-DD`. */
export interface IReleaseTag {
  tag: string;
  date: string;
}

/** The newest prerelease of one line of one package. */
export interface IPrerelease {
  /** The version, `0.4.8-18`. */
  version: string;
  tag: string;
  date: string;
}

/** What the loader hands the pages. */
export interface IPrereleases {
  /** The package a box names: `@venizia/<project name>` when the project has it, else the first package that is not retired. */
  main: string;
  /** The newest prerelease by package name, then by version line (`0.4.8`). */
  packages: Record<string, Record<string, IPrerelease>>;
}

interface IManifest {
  name?: string;
  packages?: { name: string; dir: string; retired?: boolean }[];
  release?: { tagPattern?: string; legacyTagPatterns?: string[] };
}

const VERSION = String.raw`(\d+\.\d+\.\d+)-(\d+)`;
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

export class PrereleaseTags {
  static readonly EMPTY: IPrereleases = { main: '', packages: {} };

  /**
   * The expression a tag of this package matches, from a template such as `<dir>-v<version>`; `undefined` for a template with a
   * placeholder that is neither `<dir>` nor `<version>`, which cannot name a prerelease. Capture 1 is the line, capture 2 the number.
   */
  static patternOf(opts: { template: string; dir: string }): RegExp | undefined {
    if (!opts.template.includes('<version>')) {
      return undefined;
    }

    const rest = opts.template.replace(/<(?:dir|version)>/g, '');

    if (/<[^<>]*>/.test(rest)) {
      return undefined;
    }

    const body = opts.template
      .split(/(<dir>|<version>)/)
      .map((part) => {
        if (part === '<dir>') {
          return escapeRegExp(opts.dir);
        }

        return part === '<version>' ? VERSION : escapeRegExp(part);
      })
      .join('');

    return new RegExp(`^${body}$`);
  }

  /** The newest prerelease of each line of each package among `tags`; pure, so a test can hand it a list. */
  static parse(opts: { tags: IReleaseTag[]; manifest: IManifest }): IPrereleases {
    const { manifest } = opts;
    const templates = [
      ...(manifest.release?.tagPattern === undefined ? [] : [manifest.release.tagPattern]),
      ...(manifest.release?.legacyTagPatterns ?? []),
    ];
    const live = (manifest.packages ?? []).filter((candidate) => candidate.retired !== true);
    const packages: IPrereleases['packages'] = {};

    for (const candidate of live) {
      const patterns = templates.flatMap((template) => {
        const pattern = PrereleaseTags.patternOf({ template, dir: candidate.dir });

        return pattern === undefined ? [] : [pattern];
      });
      const lines: Record<string, IPrerelease & { number: number }> = {};

      for (const { tag, date } of opts.tags) {
        for (const pattern of patterns) {
          const match = pattern.exec(tag);
          const line = match?.[1];
          const number = Number(match?.[2]);

          if (line === undefined || !Number.isInteger(number)) {
            continue;
          }

          if (lines[line] === undefined || number > (lines[line]?.number ?? -1)) {
            lines[line] = { version: `${line}-${number}`, tag, date, number };
          }
        }
      }

      if (Object.keys(lines).length > 0) {
        packages[candidate.name] = Object.fromEntries(
          Object.entries(lines).map(([line, { version, tag, date }]) => [
            line,
            { version, tag, date },
          ]),
        );
      }
    }

    const preferred = manifest.name === undefined ? undefined : `@venizia/${manifest.name}`;
    const main = live.some((candidate) => candidate.name === preferred)
      ? (preferred ?? '')
      : (live[0]?.name ?? '');

    return { main, packages };
  }

  /** The tags of the repository with their dates, from git; none when git, the repository or its tags are not there. */
  static tagsOf(opts: { root: string }): IReleaseTag[] {
    const result = spawnSync(
      'git',
      [
        '-C',
        opts.root,
        'for-each-ref',
        '--format=%(refname:short)|%(creatordate:short)',
        'refs/tags',
      ],
      { encoding: 'utf8' },
    );

    if (result.status !== 0 || typeof result.stdout !== 'string') {
      return [];
    }

    return result.stdout.split('\n').flatMap((line) => {
      const at = line.lastIndexOf('|');

      return at === -1 ? [] : [{ tag: line.slice(0, at), date: line.slice(at + 1) }];
    });
  }

  /** The repository root of a folder inside it, or `undefined` outside one. */
  static rootOf(opts: { from: string }): string | undefined {
    const result = spawnSync('git', ['-C', opts.from, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    });

    return result.status === 0 && typeof result.stdout === 'string' && result.stdout.trim() !== ''
      ? result.stdout.trim()
      : undefined;
  }

  /**
   * What the pages show, read at build time from the repository around `from`. Never throws: a build with no git, a shallow
   * clone, or a manifest that cannot be read has no prerelease to show, and the pages show none.
   */
  static read(opts: { from: string }): IPrereleases {
    try {
      const root = PrereleaseTags.rootOf({ from: opts.from });
      // The committed descriptor, else the manifest of an earlier release (a wiki that has not moved yet).
      const manifestPath =
        root === undefined
          ? undefined
          : ['atlas.manifest.json', 'vulcan.manifest.json']
              .map((name) => join(root, '.agents', name))
              .find((path) => existsSync(path));

      if (root === undefined || manifestPath === undefined) {
        return PrereleaseTags.EMPTY;
      }

      const manifest: IManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

      return PrereleaseTags.parse({ tags: PrereleaseTags.tagsOf({ root }), manifest });
    } catch {
      return PrereleaseTags.EMPTY;
    }
  }
}
