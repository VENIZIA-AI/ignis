/**
 * Keeps the npm `next` dist-tag at or above `latest` for every published package of this repository.
 * `next` may hold a prerelease, but never a version below `latest`: a consumer that installs `next`
 * must not receive an older build than one that installs `latest`.
 *
 *   bun scripts/release/sync-next-tag.ts             # move every `next` that is missing or below `latest`
 *   bun scripts/release/sync-next-tag.ts --dry-run   # print what it would do, change nothing
 *   bun scripts/release/sync-next-tag.ts --published @venizia/ignis@0.3.1 --tag latest
 *
 * `--published` names the version a publish just put under `--tag`. The registry serves the old
 * dist-tags for minutes after a publish, so that version is used for the package instead of what
 * `npm view` reports.
 *
 * It runs after a publish that must not be undone, so a failure is a loud warning and exit 0.
 */

/** `move` is true when `next` is missing or semver-lower than `latest`; with no `latest` there is nothing to compare. */
export const decideNextTag = (opts: { latest?: string; next?: string }): { move: boolean } => {
  const { latest, next } = opts;
  if (!latest) {
    return { move: false };
  }
  if (!next) {
    return { move: true };
  }

  return { move: Bun.semver.order(next, latest) < 0 };
};

export interface IPublished {
  name: string;
  version: string;
  tag: 'latest' | 'next';
}

/** Reads `--published <name>@<version> --tag <latest|next>`. Throws on a malformed value or an unknown tag. */
export const parsePublished = (args: ReadonlyArray<string>): IPublished | undefined => {
  const index = args.indexOf('--published');
  if (index < 0) {
    return undefined;
  }

  const spec = args[index + 1] ?? '';
  const at = spec.lastIndexOf('@');
  if (at <= 0 || at === spec.length - 1) {
    throw new Error(`--published needs <name>@<version>, got: ${spec || 'nothing'}`);
  }

  const tagIndex = args.indexOf('--tag');
  const tag = tagIndex >= 0 ? args[tagIndex + 1] : undefined;
  if (tag !== 'latest' && tag !== 'next') {
    throw new Error(`--tag must be latest or next, got: ${tag ?? 'nothing'}`);
  }

  return { name: spec.slice(0, at), version: spec.slice(at + 1), tag };
};

/** Right after a publish the registry still serves the old dist-tags, so the published version wins for its own tag. */
export const applyPublished = (opts: {
  name: string;
  tags: { latest?: string; next?: string };
  published?: IPublished;
}): { latest?: string; next?: string } => {
  const { name, tags, published } = opts;
  if (!published || published.name !== name) {
    return tags;
  }

  return { ...tags, [published.tag]: published.version };
};

const readNames = async (): Promise<Array<string>> => {
  const names: Array<string> = [];
  for (const file of new Bun.Glob('packages/*/package.json').scanSync('.')) {
    const manifest = await Bun.file(file).json();
    if (!manifest.private) {
      names.push(manifest.name);
    }
  }

  return names.sort();
};

const run = async (
  command: Array<string>,
): Promise<{ ok: boolean; stdout: string; stderr: string }> => {
  const proc = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() };
};

const readDistTags = async (name: string): Promise<{ latest?: string; next?: string }> => {
  const result = await run(['npm', 'view', name, 'dist-tags', '--json']);
  if (!result.ok) {
    throw new Error(`npm view ${name} dist-tags failed: ${result.stderr}`);
  }
  const tags = JSON.parse(result.stdout);

  return { latest: tags.latest, next: tags.next };
};

const main = async (): Promise<void> => {
  const isDryRun = Bun.argv.includes('--dry-run');
  const failures: Array<string> = [];
  let published: IPublished | undefined;
  try {
    published = parsePublished(Bun.argv.slice(2));
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  for (const name of await readNames()) {
    try {
      const registry = await readDistTags(name).catch(error => {
        // The registry may not list a package that was only just published.
        if (published?.name === name) {
          return {};
        }
        throw error;
      });
      const { latest, next } = applyPublished({ name, tags: registry, published });
      const { move } = decideNextTag({ latest, next });
      if (!move || !latest) {
        console.log(`kept   ${name}  next ${next ?? '-'}  latest ${latest ?? '-'}`);
        continue;
      }

      if (isDryRun) {
        console.log(`would move ${name}  next ${next ?? '-'} -> ${latest}`);
        continue;
      }

      const result = await run(['npm', 'dist-tag', 'add', `${name}@${latest}`, 'next']);
      if (!result.ok) {
        throw new Error(`npm dist-tag add ${name}@${latest} next failed: ${result.stderr}`);
      }
      console.log(`moved  ${name}  next ${next ?? '-'} -> ${latest}`);
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    console.warn(
      'WARNING: next is NOT at or above latest for some packages (non-fatal, the publish stands):',
    );
    for (const failure of failures) {
      console.warn(`  - ${failure}`);
    }
  }
};

if (import.meta.main) {
  await main();
}
