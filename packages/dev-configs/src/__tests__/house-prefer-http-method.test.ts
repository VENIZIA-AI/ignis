import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import {
  houseConfigs,
  houseEslintPlugin,
  PreferHttpMethodRule,
  reactHouseConfigs,
} from '../linters/house';

const NAME = PreferHttpMethodRule.NAME;
const roots: Array<string> = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

const buildProject = (opts: { name: string; dependsOn?: string }) => {
  const root = mkdtempSync(join(tmpdir(), 'http-method-'));
  roots.push(root);
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: opts.name,
      dependencies: opts.dependsOn ? { [opts.dependsOn]: '1.0.0' } : {},
    }),
  );

  return root;
};

const APP = buildProject({ name: 'app', dependsOn: '@venizia/ignis-helpers' });

const run = (opts: { code: string; root?: string; source?: string | null }) => {
  const { code, root = APP, source } = opts;
  const linter = new Linter({ configType: 'flat', cwd: root });
  const config: Linter.Config[] = [
    {
      files: ['**/*.ts'],
      languageOptions: { parser: tseslint.parser },
      plugins: { '@venizia': houseEslintPlugin },
      rules: { [NAME]: PreferHttpMethodRule.build({ source }) },
    },
  ];
  const filename = join(root, 'src', 'a.ts');

  return {
    found: linter.verify(code, config, filename).map((message) => message.messageId),
    fixed: linter.verifyAndFix(code, config, filename).output,
  };
};

const IMPORT = "import { HTTP } from '@venizia/ignis-helpers/common';";

describe('prefer-http-method: where a method is written', () => {
  test('a route config, a request init, a fetch call and a held method are reported', () => {
    const { found } = run({
      code: [
        "const route = { method: 'get', path: '/' };",
        "const init = { method: 'post', body };",
        "fetch(url, { method: 'head' });",
        "this.nativeFetch(url, { method: 'head' });",
        "new Request(url, { method: 'delete' });",
        "this.send({ verb: 'put', url });",
        "let method = 'get';",
        "method = flag ? 'post' : 'put';",
        "const send = (httpMethod = 'patch') => httpMethod;",
        "const sent = { method: options.method ?? 'options', headers };",
      ].join('\n'),
    });

    expect(found).toHaveLength(11);
  });

  test('a table of method names, another word and another key are left alone', () => {
    const { found } = run({
      code: [
        "const mapping = { method: 'get', className: 'RequestUtility' };",
        "const route = { method: 'connect', path: '/' };",
        "const other = { kind: 'get', path: '/' };",
        "const method = 'findOne';",
        "map.get('get');",
        "prefetch(url, { method: 'get' });",
        "fetchRecords(table, { method: 'get' });",
        "if (method === 'GET') {}",
      ].join('\n'),
    });

    expect(found).toEqual([]);
  });
});

describe('prefer-http-method: the fix', () => {
  test('the exact value is rewritten and HTTP is imported once', () => {
    const { fixed } = run({
      code: "export const a = { method: 'patch', path: '/' };\nexport const b = { method: 'get', url };",
    });

    expect(fixed).toBe(
      [
        IMPORT,
        "export const a = { method: HTTP.Methods.PATCH, path: '/' };",
        'export const b = { method: HTTP.Methods.GET, url };',
      ].join('\n'),
    );
  });

  test('an `as const` on the string goes with it, and one on the object stays', () => {
    const { fixed } = run({
      code: [
        "export const a = { method: 'get' as const, url };",
        "export const b = { method: 'post', url } as const;",
        "export let method = 'put' as const;",
        "export const c = { method: 'head' satisfies string, url };",
      ].join('\n'),
    });

    expect(fixed).toBe(
      [
        IMPORT,
        'export const a = { method: HTTP.Methods.GET, url };',
        'export const b = { method: HTTP.Methods.POST, url } as const;',
        'export let method = HTTP.Methods.PUT;',
        'export const c = { method: HTTP.Methods.HEAD satisfies string, url };',
      ].join('\n'),
    );
  });

  test('another spelling is reported with the note, and left as written', () => {
    const code = "export const a = { method: 'PATCH', url };";
    const { found, fixed } = run({ code });

    expect(found).toEqual(['spelling']);
    expect(fixed).toBe(code);
  });

  test('an uppercase method the framework sends is rewritten: a route config, an execute, send or request object', () => {
    const { fixed } = run({
      code: [
        "export const a = { method: 'PATCH', path: '/', responses };",
        "export const b = { configs: { method: 'GET', path: '/' } };",
        "export const c = { method: 'POST', path: '/', responses } satisfies IAuthRouteConfig;",
        "this.fetcher.send({ method: 'PUT', url });",
        "client.request({ method: 'DELETE', path: '/a' });",
        "source.execute({ method: isNew ? 'POST' : 'PATCH', baseUrl });",
      ].join('\n'),
    });

    expect(fixed).toBe(
      [
        IMPORT,
        "export const a = { method: HTTP.Methods.PATCH, path: '/', responses };",
        "export const b = { configs: { method: HTTP.Methods.GET, path: '/' } };",
        "export const c = { method: HTTP.Methods.POST, path: '/', responses } satisfies IAuthRouteConfig;",
        'this.fetcher.send({ method: HTTP.Methods.PUT, url });',
        "client.request({ method: HTTP.Methods.DELETE, path: '/a' });",
        'source.execute({ method: isNew ? HTTP.Methods.POST : HTTP.Methods.PATCH, baseUrl });',
      ].join('\n'),
    );
  });

  for (const from of ['@venizia/ignis-connectors', '@venizia/ardor/repository']) {
    test(`a repository execute with paths is rewritten | ${from}`, () => {
      const code = [
        `import { HttpRepository } from '${from}';`,
        'export class Merchants extends HttpRepository {',
        '  aggregate(id: string, data: IMerchant) {',
        "    return this.execute({ paths: [RestEndpoints.MERCHANT, encodeURIComponent(String(id)), 'aggregate'], method: 'PATCH', body: data, schema: z.custom<IMerchant>() });",
        '  }',
        '}',
      ].join('\n');

      expect(run({ code }).fixed).toContain('method: HTTP.Methods.PATCH, body: data');
    });
  }

  test('an object held under configs inside a fetch call is left as written', () => {
    const code = "fetch(url, { configs: { method: 'PATCH' } });";

    expect(run({ code }).fixed).toBe(code);
  });

  test('a send of a resource with the method in params is rewritten', () => {
    const { fixed } = run({
      code: "export const sent = provider.send({ resource: 'merchants', params: { method: 'POST', body } });",
    });

    expect(fixed).toContain('params: { method: HTTP.Methods.POST, body }');
  });

  for (const [name, code] of [
    ['a fetch call that names responses', "fetch(url, { method: 'PATCH', responses });"],
    [
      'a typed init of a new Request',
      "new Request(url, { method: 'PATCH', responses } satisfies RequestInit);",
    ],
    ['params of a send with no resource', "socket.send({ params: { method: 'PATCH', body } });"],
    ['params outside a send', "const call = { resource: 'a', params: { method: 'PATCH', body } };"],
    ['a fetch call', "fetch(url, { method: 'PATCH', body });"],
    ['a wrapped fetch', "this.nativeFetch(url, { method: 'PATCH', body });"],
    ['a new Request', "new Request(url, { method: 'PATCH', body });"],
    ['an init held on its own', "const init = { method: 'PATCH', body };"],
    ['a held method', "const method = 'PATCH';"],
    ['a default parameter', "const send = (method = 'PATCH') => method;"],
    ['a bare request call', "request(url, { method: 'PATCH', body });"],
    ['a message with no target', "socket.send({ method: 'PATCH', data });"],
    [
      'a file that imports another HTTP client',
      "import { Client } from 'undici';\nclient.request({ method: 'PATCH', path: '/a' });",
    ],
    ['a mixed spelling', "this.fetcher.send({ method: 'Patch', url });"],
  ] as const) {
    test(`an uppercase method is only reported: ${name}`, () => {
      const { found, fixed } = run({ code });

      expect(found).toEqual(['spelling']);
      expect(fixed).toBe(code);
    });
  }

  test('no fix with source null, and none inside the package that owns HTTP', () => {
    const code = "export const a = { method: 'get', url };";
    const owner = buildProject({
      name: '@venizia/ignis-helpers',
      dependsOn: '@venizia/ignis-inversion',
    });

    expect(run({ code, source: null }).fixed).toBe(code);
    expect(run({ code, root: owner }).fixed).toBe(code);
    expect(run({ code, root: owner }).found).toEqual(['constant']);
  });
});

describe('prefer-http-method: where it applies', () => {
  test('a project without an IGNIS dependency is not checked', () => {
    const plain = buildProject({ name: 'plain', dependsOn: 'express' });

    expect(run({ code: "const a = { method: 'get', url };", root: plain }).found).toEqual([]);
  });

  test('both presets turn it on as an error, and off in tests', () => {
    for (const preset of [houseConfigs, reactHouseConfigs]) {
      const levels = preset.map((config) => config.rules?.[NAME]).filter(Boolean);

      expect(levels).toEqual([['error'], 'off']);
    }
  });
});
