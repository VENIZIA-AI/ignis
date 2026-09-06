import { AtlasConstants, AtlasModes } from '@/common';
import { Chunker, CorpusLoader, resolveRepositoryRoots } from '@/corpus';
import { Transport } from '@/protocol';
import { ReleaseStore } from '@/releases';
import type { IReleaseTable } from '@/releases';
import { ChunkStore } from '@/search/store';
import { buildChangesTool } from '@/tools/changes.tool';
import { buildGetTool } from '@/tools/get.tool';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

// __dirname, not import.meta: this package emits CommonJS.
const REPOSITORY_ROOT = join(__dirname, '../../../../..');

const entry = (opts: {
  date: string;
  slug: string;
  packages: string[];
  kind?: string | null;
  title?: string;
}) => ({
  id: `changelog:${opts.date}-${opts.slug}`,
  file: `${opts.date}-${opts.slug}.md`,
  date: opts.date,
  title: opts.title ?? opts.slug,
  packages: opts.packages,
  kind: opts.kind ?? null,
});

const TABLE: IReleaseTable = {
  releases: {
    kernel: [
      { version: '0.2.0-16', date: '2026-09-05', sha: 'fda2d717' },
      { version: '0.2.0-15', date: '2026-09-05', sha: 'd1b3c139' },
      { version: '0.2.0-14', date: '2026-09-04', sha: '5922b420' },
      { version: '0.2.0-13', date: '2026-08-31', sha: '370fd0a2' },
    ],
    helpers: [{ version: '0.2.0-12', date: '2026-09-04', sha: 'aaaaaaaa' }],
  },
  changelogs: [
    entry({ date: '2026-09-05', slug: 'list-response', packages: ['kernel'], kind: 'New Feature' }),
    entry({ date: '2026-09-04', slug: 'helpers-seams', packages: ['helpers'] }),
    entry({ date: '2026-09-02', slug: 'decorators', packages: ['boot', 'kernel'] }),
    entry({ date: '2026-08-31', slug: 'lower-edge', packages: ['kernel'] }),
  ],
};

const releases = new ReleaseStore({ table: TABLE });

interface IChangesPayload {
  package: string | null;
  from: string | null;
  to: string;
  entries: { id: string; date: string; title: string; kind: string | null; packages: string[] }[];
  truncated?: boolean;
}

const callChanges = async (opts: {
  releases: ReleaseStore;
  args: Record<string, unknown>;
}): Promise<{
  error?: { code: number; message: string };
  result?: { content: { type: string; text: string }[] };
}> => {
  const transport = new Transport({
    tools: [buildChangesTool({ releases: opts.releases })],
    serverName: 'atlas-test',
    serverVersion: '0.0.0',
  });
  const reply = await transport.handleLine({
    line: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'changes', arguments: opts.args },
    }),
  });
  return JSON.parse(reply ?? 'null');
};

const payloadOf = (reply: { result?: { content: { text: string }[] } }): IChangesPayload =>
  JSON.parse(reply.result?.content[0]?.text ?? '{}');

describe('changes tool', () => {
  test('two versions of one package answer with the entries in that window', async () => {
    const payload = payloadOf(
      await callChanges({
        releases,
        args: { package: 'kernel', from: '0.2.0-13', to: '0.2.0-16' },
      }),
    );

    expect(payload.package).toBe('kernel');
    expect(payload.from).toBe('0.2.0-13');
    expect(payload.to).toBe('0.2.0-16');
    expect(payload.entries.map(item => item.id)).toEqual([
      'changelog:2026-09-05-list-response',
      'changelog:2026-09-02-decorators',
    ]);
  });

  test('an entry dated exactly on the opening release is excluded', async () => {
    const payload = payloadOf(
      await callChanges({
        releases,
        args: { package: 'kernel', from: '0.2.0-13', to: '0.2.0-16' },
      }),
    );

    expect(payload.entries.map(item => item.id)).not.toContain('changelog:2026-08-31-lower-edge');
  });

  test('a package with no versions given spans the newest day of releases, never an empty same-day window', async () => {
    const payload = payloadOf(await callChanges({ releases, args: { package: 'kernel' } }));

    // 0.2.0-15 shares 2026-09-05 with 0.2.0-16, so the lower bound is the newest EARLIER day.
    expect(payload.to).toBe('0.2.0-16');
    expect(payload.from).toBe('0.2.0-14');
    expect(payload.entries.map(record => record.id)).toEqual([
      'changelog:2026-09-05-list-response',
    ]);
  });

  test('the npm spelling of a package name is accepted', async () => {
    const payload = payloadOf(
      await callChanges({ releases, args: { package: '@venizia/ignis-kernel' } }),
    );

    expect(payload.package).toBe('kernel');
  });

  test('no package spans every package and reads from and to as dates', async () => {
    const payload = payloadOf(
      await callChanges({ releases, args: { from: '2026-09-01', to: '2026-09-05' } }),
    );

    expect(payload.package).toBeNull();
    expect(payload.from).toBe('2026-09-01');
    expect(payload.to).toBe('2026-09-05');
    expect(payload.entries.map(item => item.id)).toEqual([
      'changelog:2026-09-05-list-response',
      'changelog:2026-09-04-helpers-seams',
      'changelog:2026-09-02-decorators',
    ]);
  });

  test('no package and no dates default to the newest day of changes', async () => {
    const payload = payloadOf(await callChanges({ releases, args: {} }));

    expect(payload.to).toBe('2026-09-05');
    expect(payload.from).toBe('2026-09-04');
    expect(payload.entries.map(item => item.id)).toEqual(['changelog:2026-09-05-list-response']);
  });

  test('every entry carries its date, title, kind and packages', async () => {
    const payload = payloadOf(
      await callChanges({ releases, args: { package: 'kernel', from: '0.2.0-14' } }),
    );

    expect(payload.entries[0]).toEqual({
      id: 'changelog:2026-09-05-list-response',
      date: '2026-09-05',
      title: 'list-response',
      kind: 'New Feature',
      packages: ['kernel'],
    });
  });

  test('two releases of one day leave an empty window - the window is dates, not commits', async () => {
    const payload = payloadOf(
      await callChanges({
        releases,
        args: { package: 'kernel', from: '0.2.0-15', to: '0.2.0-16' },
      }),
    );

    expect(payload.entries).toEqual([]);
  });

  test('an unknown package is -32602 naming the known ones', async () => {
    const reply = await callChanges({ releases, args: { package: 'kernl' } });

    expect(reply.error?.code).toBe(-32602);
    expect(reply.error?.message).toBe("unknown package 'kernl'; known packages: helpers, kernel");
  });

  test('an unknown version is -32602 naming the known ones', async () => {
    const reply = await callChanges({ releases, args: { package: 'kernel', to: '9.9.9' } });

    expect(reply.error?.code).toBe(-32602);
    expect(reply.error?.message).toContain("unknown version '9.9.9' for kernel");
    expect(reply.error?.message).toContain('0.2.0-16');
  });

  test('the known-value list is capped at ten', async () => {
    const crowded = new ReleaseStore({
      table: {
        releases: {
          kernel: Array.from({ length: 25 }, (_unused, index) => ({
            version: `0.2.0-${25 - index}`,
            date: '2026-09-05',
            sha: 'aaaaaaaa',
          })),
        },
        changelogs: [],
      },
    });

    const reply = await callChanges({ releases: crowded, args: { package: 'kernel', to: 'nope' } });
    const listed = (reply.error?.message ?? '').split('known versions: ')[1] ?? '';

    expect(listed.split(', ')).toHaveLength(10);
  });

  test('a date is rejected where a version belongs, naming the versions that exist', async () => {
    const reply = await callChanges({
      releases,
      args: { package: 'kernel', from: '2026-08-31', to: '0.2.0-16' },
    });

    expect(reply.error?.code).toBe(-32602);
    expect(reply.error?.message).toContain("unknown version '2026-08-31' for kernel");
  });

  test('a version is rejected where a date belongs', async () => {
    const reply = await callChanges({ releases, args: { to: '0.2.0-16' } });

    expect(reply.error?.code).toBe(-32602);
    expect(reply.error?.message).toBe(
      "to must be a YYYY-MM-DD date when no package is given; got '0.2.0-16'",
    );
  });

  test('a long window is trimmed to the newest entries and says it was', async () => {
    const crowded = new ReleaseStore({
      table: {
        releases: TABLE.releases,
        changelogs: Array.from({ length: 30 }, (_unused, index) =>
          entry({
            date: `2026-07-${String(index + 1).padStart(2, '0')}`,
            slug: `entry-number-${index}-with-a-long-enough-slug-to-cost-budget`,
            packages: ['kernel'],
            title: `A title long enough to make the reply outgrow its budget ${index}`,
          }),
        ),
      },
    });

    const reply = await callChanges({
      releases: crowded,
      args: { from: '2026-01-01', to: '2026-09-05' },
    });
    const payload = payloadOf(reply);

    expect(reply.result?.content[0]?.text.length).toBeLessThanOrEqual(
      AtlasConstants.SEARCH_BUDGET_CHARS,
    );
    expect(payload.truncated).toBe(true);
    expect(payload.entries.length).toBeGreaterThan(0);
    expect(payload.entries[0].date).toBe('2026-07-30');
  });

  test('a build with no release table says so instead of guessing', async () => {
    const reply = await callChanges({
      releases: new ReleaseStore({ table: { releases: {}, changelogs: [] } }),
      args: {},
    });

    expect(reply.error?.code).toBe(-32602);
    expect(reply.error?.message).toBe('no release table in this build');
  });
});

const hasRepositoryRoots =
  existsSync(join(REPOSITORY_ROOT, 'docs/wiki/content')) &&
  existsSync(join(REPOSITORY_ROOT, '.agents/knowledge'));

describe.skipIf(!hasRepositoryRoots)('the P3 acceptance gate, over the real release table', () => {
  const realReleases = ReleaseStore.load({ mode: AtlasModes.REPOSITORY, root: REPOSITORY_ROOT });
  const documents = CorpusLoader.getInstance().load({
    roots: resolveRepositoryRoots({ repositoryRoot: REPOSITORY_ROOT }),
  });
  const chunker = Chunker.getInstance();
  const store = new ChunkStore();
  store.add({ chunks: documents.flatMap(document => chunker.chunk({ document })) });

  const getTransport = new Transport({
    tools: [buildGetTool({ store })],
    serverName: 'atlas-test',
    serverVersion: '0.0.0',
  });

  test('kernel 0.2.0-13 to 0.2.0-16 lists exactly the entries dated inside that window', async () => {
    const payload = payloadOf(
      await callChanges({
        releases: realReleases,
        args: { package: 'kernel', from: '0.2.0-13', to: '0.2.0-16' },
      }),
    );

    const fromDate = realReleases.releaseDateOf({ package: 'kernel', version: '0.2.0-13' }) ?? '';
    const toDate = realReleases.releaseDateOf({ package: 'kernel', version: '0.2.0-16' }) ?? '';
    const expected = realReleases
      .entriesBetween({ package: 'kernel', fromDate, toDate })
      .map(item => item.id);

    expect(payload.truncated).toBeUndefined();
    expect(payload.entries.map(item => item.id)).toEqual(expected);
    for (const item of payload.entries) {
      expect(item.date > fromDate && item.date <= toDate).toBe(true);
      expect(item.packages).toContain('kernel');
    }
  });

  test('every id it returned resolves through the get tool', async () => {
    const payload = payloadOf(
      await callChanges({
        releases: realReleases,
        args: { package: 'kernel', from: '0.2.0-13', to: '0.2.0-16' },
      }),
    );

    expect(payload.entries.length).toBeGreaterThan(0);
    for (const item of payload.entries) {
      const reply = await getTransport.handleLine({
        line: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'get', arguments: { id: item.id } },
        }),
      });
      const parsed: { error?: { message: string } } = JSON.parse(reply ?? 'null');

      expect(parsed.error, `${item.id}: ${parsed.error?.message}`).toBeUndefined();
    }
  });
});
