import type { BunPlugin } from 'bun';
import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const AUTHORIZE = resolve(__dirname, '..', '..', 'components', 'auth', 'authorize');
const ABSENT = 'casbin-not-installed';

/** Stands in for an application without casbin: every `casbin` specifier in the authorize sources points at a package that does not exist, and every other package stays external. */
const withoutCasbin: BunPlugin = {
  name: 'without-casbin',
  setup: build => {
    build.onLoad({ filter: /[\\/]authorize[\\/].*\.ts$/ }, async args => ({
      contents: (await Bun.file(args.path).text()).replaceAll("'casbin'", `'${ABSENT}'`),
      loader: 'ts',
    }));
    build.onResolve({ filter: /^[^./]/ }, args =>
      args.path === ABSENT ? undefined : { path: args.path, external: true },
    );
  },
};

describe('casbin is an optional peer', () => {
  test('a build of the authorize sources succeeds without casbin installed', async () => {
    const result = await Bun.build({
      entrypoints: [
        resolve(AUTHORIZE, 'enforcers', 'casbin.enforcer.ts'),
        resolve(AUTHORIZE, 'adapters', 'base-filtered.ts'),
      ],
      target: 'bun',
      plugins: [withoutCasbin],
      throw: false,
    });
    expect(result.logs.map(log => String(log.message))).toEqual([]);
    expect(result.success).toBe(true);
  });
});
