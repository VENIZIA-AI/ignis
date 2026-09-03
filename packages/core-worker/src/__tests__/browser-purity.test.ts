import { beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * This package is the browser Worker host, so nothing it ships may reach a Node or Bun host. Two
 * mechanisms enforce that at author time and this file pins both, because neither one fails loudly
 * when it is removed:
 *
 * - `tsconfig.build.json` sets `types: []`, which is what removes the `Bun` namespace, and
 *   `lib: ["ES2024", "WebWorker"]`, which is what supplies OPFS. Adding `types: ["bun"]` back to
 *   stop an editor complaining would silently undo it.
 * - `eslint.config.mjs` restricts Node's host globals and the builtin module specifiers. tsc cannot
 *   do this job: `ioredis` (reached through `@venizia/ignis-helpers/core`) and `casbin` (reached
 *   through `@venizia/ignis-kernel`) both carry `/// <reference types="node" />` in their published
 *   declarations, and a type-library reference from a `.d.ts` is unconditional - so `process`,
 *   `Buffer`, `__dirname` and `setImmediate` type-check here whatever the tsconfig says.
 *
 * These cases are deliberately NOT asserted, because no ESLint rule can see them: `globalThis['process']`
 * and any `import(specifierVariable)`. `make purity` catches both on the bundled output.
 */

// `__dirname`, not `import.meta`: this package emits CommonJS, and the path must not depend on the
// CWD `bun test` runs from.
const PACKAGE_ROOT = resolve(__dirname, '..', '..');
const PACKAGE_BIN = join(PACKAGE_ROOT, 'node_modules', '.bin');
const TSC = join(PACKAGE_BIN, 'tsc');
const ESLINT = join(PACKAGE_BIN, 'eslint');
const PRODUCTION_TSCONFIG = join(PACKAGE_ROOT, 'tsconfig.build.json');

/** Written and removed per probe. Untracked, so a crashed run leaves something visible, not silent. */
const PROBE_CONFIG_NAME = 'tsconfig.browser-purity-probe.json';

/** Paths ESLint's project service already knows, used as the identity for a `--stdin` lint. */
const PRODUCTION_PATH = 'src/index.ts';
const TEST_PATH = 'src/__tests__/envelope.test.ts';

const PURITY_RULES = new Set([
  'no-restricted-globals',
  'no-restricted-imports',
  'no-restricted-syntax',
]);

/**
 * `tsconfig.json` configures JSX, so a production source may be a `.tsx` file. ESLint's project
 * service refuses a `--stdin-filename` that is not on disk, so this one case needs a real file.
 */
const TSX_PROBE_NAME = 'src/__browser-purity-probe__.tsx';

const TIMEOUT_MS = 120_000;

/**
 * `crypto.randomUUID` type-checks and lints clean - it is a real Web Crypto API, present in every
 * `lib.webworker` - but a browser exposes it only in a SECURE CONTEXT. On a plain-http LAN origin
 * or inside a WebView it is `undefined`, and the first line that calls it throws. No rule in
 * `eslint.config.mjs` covers a conditionally-available API, and the two halves of the BFF channel
 * already disagreed about this one once. `RequestIdGenerator` is what a production source uses.
 */
const RANDOM_UUID_MESSAGE =
  'crypto.randomUUID is secure-context only - use RequestIdGenerator instead.';

interface IProcessResult {
  exitCode: number;
  output: string;
}

const run = async ({
  command,
  stdin,
}: {
  command: string[];
  stdin?: string;
}): Promise<IProcessResult> => {
  const child = Bun.spawn(command, {
    cwd: PACKAGE_ROOT,
    stdin: stdin === undefined ? 'ignore' : new TextEncoder().encode(stdin),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { exitCode, output: `${stdout}${stderr}` };
};

/**
 * Type-checks the real production graph plus one fixture, using the real `tsconfig.build.json`. The
 * generated config must sit in the package root: `types` entries resolve by walking up from the
 * config file, so a config in a temp directory would fail to find any type package and the probe
 * would pass or fail for the wrong reason. The fixture is added through `files` because `exclude`
 * does not apply to it.
 */
const typeCheckProductionGraphWith = async ({
  fixture,
}: {
  fixture: string;
}): Promise<IProcessResult> => {
  const configPath = join(PACKAGE_ROOT, PROBE_CONFIG_NAME);
  rmSync(configPath, { force: true });

  try {
    writeFileSync(
      configPath,
      JSON.stringify({
        extends: './tsconfig.build.json',
        compilerOptions: { noEmit: true, incremental: false },
        include: ['src'],
        files: [`src/__tests__/fixtures/${fixture}`],
      }),
    );

    return await run({ command: [TSC, '--noEmit', '-p', configPath] });
  } finally {
    rmSync(configPath, { force: true });
  }
};

const purityFindingsFrom = ({ output }: { output: string }): string[] => {
  const results = JSON.parse(output) as {
    messages: { ruleId: string | null; message: string }[];
  }[];

  const messages = results[0]?.messages ?? [];
  const fatal = messages.filter(message => message.ruleId === null);
  if (fatal.length > 0) {
    throw new Error(`ESLint could not parse the probe: ${fatal[0]?.message}`);
  }

  return messages
    .filter(message => message.ruleId !== null && PURITY_RULES.has(message.ruleId))
    .map(message => `${message.ruleId}: ${message.message}`);
};

const lintAs = async ({ path, source }: { path: string; source: string }): Promise<string[]> => {
  const { output } = await run({
    command: [ESLINT, '--stdin', '--stdin-filename', path, '--format', 'json'],
    stdin: source,
  });

  return purityFindingsFrom({ output });
};

/** For the `.tsx` case only, which ESLint's project service will not accept over `--stdin`. */
const lintRealFile = async ({
  relativePath,
  source,
}: {
  relativePath: string;
  source: string;
}): Promise<string[]> => {
  const filePath = join(PACKAGE_ROOT, relativePath);
  rmSync(filePath, { force: true });

  try {
    writeFileSync(filePath, source);
    const { output } = await run({ command: [ESLINT, relativePath, '--format', 'json'] });
    return purityFindingsFrom({ output });
  } finally {
    rmSync(filePath, { force: true });
  }
};

/**
 * Every impurity in one source, linted once. A separate ESLint spawn per case costs ~2s because the
 * project service reloads each time; the marker keeps the per-case granularity for free.
 *
 * `fs/promises` and `string_decoder` are here on purpose: they were both missing from the
 * hand-written builtin list this replaced, and only `n/prefer-node-protocol` was catching them.
 */
const IMPURE_SOURCE = [
  "import { readFileSync } from 'node:fs';",
  "import { statSync } from 'fs';",
  "import { readFile } from 'fs/promises';",
  "import { StringDecoder } from 'string_decoder';",
  "import { Database } from 'bun:sqlite';",
  'export const a = [readFileSync, statSync, readFile, StringDecoder, Database];',
  'export const b: string | undefined = process.env.NODE_ENV;',
  'export const c = Buffer.from([1]);',
  'export const d: string = __dirname;',
  'export const e = require;',
  'export const f: string | undefined = Bun.env.NODE_ENV;',
  'export const g = setImmediate(() => {});',
  'export const h = (handle: unknown) => clearImmediate(handle as never);',
  "export const i = async () => import('node:os');",
  "export const j = async () => import('bun:ffi');",
].join('\n');

const IMPURITY_MARKERS = [
  { label: 'process', marker: "Unexpected use of 'process'" },
  { label: 'Buffer', marker: "Unexpected use of 'Buffer'" },
  { label: '__dirname', marker: "Unexpected use of '__dirname'" },
  { label: 'require', marker: "Unexpected use of 'require'" },
  { label: 'setImmediate', marker: "Unexpected use of 'setImmediate'" },
  { label: 'clearImmediate', marker: "Unexpected use of 'clearImmediate'" },
  { label: 'the Bun namespace', marker: "Unexpected use of 'Bun'" },
  { label: "a 'node:' import", marker: "'node:fs' import is restricted" },
  { label: 'a bare Node builtin import', marker: "'fs' import is restricted" },
  { label: 'a sub-path Node builtin import', marker: "'fs/promises' import is restricted" },
  {
    label: 'a Node builtin absent from the old list',
    marker: "'string_decoder' import is restricted",
  },
  { label: "a 'bun:' import", marker: "'bun:sqlite' import is restricted" },
  {
    label: 'a dynamic import of a Node or Bun builtin',
    marker: 'dynamically imported or not',
  },
];

describe('browser purity is enforced at author time', () => {
  test('the toolchain this suite drives is present', () => {
    expect(existsSync(TSC)).toBe(true);
    expect(existsSync(ESLINT)).toBe(true);
    expect(existsSync(PRODUCTION_TSCONFIG)).toBe(true);
  });

  test(
    'the production type-check admits no host type packages and supplies the Worker lib',
    async () => {
      const { exitCode, output } = await run({
        command: [TSC, '--showConfig', '-p', PRODUCTION_TSCONFIG],
      });
      expect(exitCode).toBe(0);

      const { compilerOptions } = JSON.parse(output) as {
        compilerOptions: { types?: string[]; lib?: string[] };
      };

      expect(compilerOptions.types).toEqual([]);
      expect(compilerOptions.lib).toEqual(['es2024', 'webworker']);
    },
    TIMEOUT_MS,
  );

  test(
    'a production source cannot reach the Bun namespace',
    async () => {
      const { exitCode, output } = await typeCheckProductionGraphWith({
        fixture: 'bun-namespace.probe.ts',
      });

      expect(output).toContain("Cannot find name 'Bun'");
      expect(exitCode).not.toBe(0);
    },
    TIMEOUT_MS,
  );

  test(
    'a production source can reach the OPFS types this package exists for',
    async () => {
      const { exitCode, output } = await typeCheckProductionGraphWith({ fixture: 'opfs.probe.ts' });

      expect(output).toBe('');
      expect(exitCode).toBe(0);
    },
    TIMEOUT_MS,
  );

  test(
    'the lint gate covers .tsx production sources, which this package configures JSX for',
    async () => {
      const findings = await lintRealFile({
        relativePath: TSX_PROBE_NAME,
        source: "export const LeakedConfig = (): string => process.env.NODE_ENV ?? '';\n",
      });

      expect(findings.join('\n')).toContain("Unexpected use of 'process'");
    },
    TIMEOUT_MS,
  );

  describe('the lint gate refuses these statically visible host references', () => {
    let findings: string[] = [];

    beforeAll(async () => {
      findings = await lintAs({ path: PRODUCTION_PATH, source: IMPURE_SOURCE });
    }, TIMEOUT_MS);

    for (const { label, marker } of IMPURITY_MARKERS) {
      test(`${label} in a production source`, () => {
        // Joined, not `.some()`: a failure then prints every finding ESLint did report.
        expect(findings.join('\n')).toContain(marker);
      });
    }
  });

  /**
   * `crypto.randomUUID` type-checks and lints clean - it is a real Web Crypto API, present in every
   * `lib.webworker` - but a browser exposes it only in a SECURE CONTEXT. On a plain-http LAN origin
   * or inside a WebView it is `undefined`, and the first line that calls it throws. No ESLint rule
   * in this package covers a conditionally-available API, and the two halves of the BFF channel
   * already disagreed about it once. `RequestIdGenerator` is what a production source uses.
   */
  test(
    'no production source calls crypto.randomUUID, which browsers gate on a secure context',
    async () => {
      // Driven through ESLint rather than a text search: the two files that document WHY the API is
      // unusable name it in their prose, and a grep cannot tell a doc comment from a call site.
      const { output } = await run({
        command: [
          ESLINT,
          'src',
          '--ignore-pattern',
          'src/__tests__/**',
          '--rule',
          JSON.stringify({
            'no-restricted-syntax': [
              'error',
              {
                selector: 'MemberExpression[property.name=randomUUID]',
                message: RANDOM_UUID_MESSAGE,
              },
              {
                selector: 'MemberExpression[property.value=randomUUID]',
                message: RANDOM_UUID_MESSAGE,
              },
            ],
          }),
          '--format',
          'json',
        ],
      });

      const results = JSON.parse(output) as {
        filePath: string;
        messages: { message: string; line: number }[];
      }[];

      const offenders = results.flatMap(result =>
        result.messages
          .filter(message => message.message === RANDOM_UUID_MESSAGE)
          .map(message => `${result.filePath}:${message.line}`),
      );

      expect(offenders).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    'the lint gate says nothing about a clean production source',
    async () => {
      const findings = await lintAs({
        path: PRODUCTION_PATH,
        source: 'export const a = (): number => 1;',
      });
      expect(findings).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    'the lint gate leaves the Bun tests alone, so the exemption is deliberate and narrow',
    async () => {
      const findings = await lintAs({
        path: TEST_PATH,
        source: 'export const a: string | undefined = process.env.NODE_ENV;',
      });
      expect(findings).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
