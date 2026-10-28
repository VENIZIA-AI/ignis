import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const REPOSITORY_URL = 'git+https://github.com/VENIZIA-AI/ignis.git';

interface IManifest {
  name: string;
  private?: boolean;
  repository?: { type?: string; url?: string; directory?: string };
}

const publishedManifests = (): Array<{ directory: string; manifest: IManifest }> =>
  readdirSync(resolve(ROOT, 'packages'))
    .map((directory) => ({
      directory,
      manifest: JSON.parse(
        readFileSync(resolve(ROOT, 'packages', directory, 'package.json'), 'utf8'),
      ) as IManifest,
    }))
    .filter(({ manifest }) => !manifest.private);

/** What a trusted publisher needs: provenance is refused when the manifest's repository is not the one the run came from. */
const findRepositoryProblem = (opts: { directory: string; manifest: IManifest }): string | null => {
  const { directory, manifest } = opts;

  if (manifest.repository?.url !== REPOSITORY_URL) {
    return `${manifest.name}: repository.url is ${manifest.repository?.url ?? 'missing'}, expected ${REPOSITORY_URL}`;
  }

  if (manifest.repository.directory !== `packages/${directory}`) {
    return `${manifest.name}: repository.directory is ${manifest.repository.directory ?? 'missing'}, expected packages/${directory}`;
  }

  return null;
};

describe('every published package names this repository, for provenance', () => {
  test('the nine packages are found', () => {
    expect(publishedManifests()).toHaveLength(9);
  });

  test('each repository.url and directory match', () => {
    const problems = publishedManifests()
      .map((entry) => findRepositoryProblem(entry))
      .filter((problem) => problem !== null);

    expect(problems).toEqual([]);
  });

  test('a missing or foreign repository is noticed', () => {
    expect(
      findRepositoryProblem({ directory: 'connectors', manifest: { name: '@x/connectors' } }),
    ).toContain('missing');
    expect(
      findRepositoryProblem({
        directory: 'kernel',
        manifest: {
          name: '@x/kernel',
          repository: {
            url: 'git+https://github.com/VENIZIA-AI/vulcan.git',
            directory: 'packages/kernel',
          },
        },
      }),
    ).toContain('repository.url');
    expect(
      findRepositoryProblem({
        directory: 'kernel',
        manifest: {
          name: '@x/kernel',
          repository: { url: REPOSITORY_URL, directory: 'packages/boot' },
        },
      }),
    ).toContain('repository.directory');
  });
});
