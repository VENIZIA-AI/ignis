import { afterAll, describe, expect, test } from 'bun:test';
import { Glob } from 'bun';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { VulcanPreset } from '../vulcan-preset';

/**
 * The shared kind of the IGNIS preset: a side-neutral package, built from presets/shared. These tests
 * read the real preset, built into a temp folder, and each check carries a positive control (a
 * fixture that must fail it), so a green run is not an empty one.
 */
const ROOT = resolve(import.meta.dir, '..', '..', '..');
const KINDS = ['app', 'lib', 'shared'];
const DEPENDENCY_MAPS = ['dependencies', 'devDependencies', 'peerDependencies', 'peers'];
/** The one `@venizia/*` name the shared kind may name: the tooling of all three repositories. */
const ALLOWED_PACKAGE = '@venizia/dev-configs';
const ALLOWED_MAP = 'devDependencies';
const FORBIDDEN_PREFIX = '@venizia/';
const CODE_EXTENSIONS = new Set(['.ts', '.mts', '.cts', '.tsx', '.js', '.mjs', '.cjs', '.jsx']);
const SHARED_TOKENS = ['project', 'shared', 'package'];

const scratch = mkdtempSync(join(tmpdir(), 'ignis-shared-preset-'));
let counter = 0;

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const freshFolder = (): string => {
  counter += 1;
  const folder = join(scratch, `folder-${counter}`);
  mkdirSync(folder, { recursive: true });
  return folder;
};

const writeText = (opts: { root: string; path: string; content: string }): void => {
  const full = join(opts.root, opts.path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, opts.content);
};

const readJson = (opts: { file: string }): Record<string, unknown> =>
  JSON.parse(readFileSync(opts.file, 'utf8'));

const listFiles = (opts: { dir: string }): string[] =>
  [...new Glob('**/*').scanSync({ cwd: opts.dir, dot: true })].sort();

/** The text without `/* *\/` and `//` comments, enough to read imports and quoted names. */
const stripComments = (opts: { source: string }): string =>
  opts.source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

const extensionOf = (opts: { path: string }): string => {
  const index = opts.path.lastIndexOf('.');
  return index < 0 ? '' : opts.path.slice(index);
};

const IMPORT_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** Every module specifier a code file imports, exports from, requires or dynamically imports. */
const readSpecifiers = (opts: { source: string }): string[] => {
  const code = stripComments({ source: opts.source });

  return IMPORT_PATTERNS.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => match[1] ?? ''),
  );
};

/**
 * The reasons a built shared preset (a folder with preset.json and files/) names an IGNIS or ARDOR
 * package: any `@venizia/*` name in a dependency map or an import, except `@venizia/dev-configs` as
 * a devDependency and in the tooling files under `.configs/`.
 */
const findNeutralityViolations = (opts: { presetDir: string }): string[] => {
  const violations: string[] = [];
  const preset = readJson({ file: join(opts.presetDir, 'preset.json') });

  for (const map of DEPENDENCY_MAPS) {
    const entries = preset[map];

    if (typeof entries !== 'object' || entries === null) {
      continue;
    }

    for (const name of Object.keys(entries)) {
      if (name.startsWith(FORBIDDEN_PREFIX) && !(name === ALLOWED_PACKAGE && map === ALLOWED_MAP)) {
        violations.push(`preset.json ${map}: ${name}`);
      }
    }
  }

  const filesDir = join(opts.presetDir, 'files');

  for (const path of listFiles({ dir: filesDir })) {
    if (!CODE_EXTENSIONS.has(extensionOf({ path }))) {
      continue;
    }

    const isTooling = path.startsWith('.configs/');

    for (const specifier of readSpecifiers({
      source: readFileSync(join(filesDir, path), 'utf8'),
    })) {
      const isAllowed = isTooling && specifier.startsWith(`${ALLOWED_PACKAGE}/`);

      if (specifier.startsWith(FORBIDDEN_PREFIX) && !isAllowed) {
        violations.push(`files/${path} imports ${specifier}`);
      }
    }
  }

  return violations;
};

/** A built-shaped shared preset for the controls: preset.json and files/. */
const makeFixturePreset = (opts: {
  preset?: Record<string, unknown>;
  files?: Record<string, string>;
}): string => {
  const presetDir = freshFolder();

  writeText({
    root: presetDir,
    path: 'preset.json',
    content: JSON.stringify({
      presetVersion: 1,
      summary: 'A fixture.',
      devDependencies: { [ALLOWED_PACKAGE]: '1.0.0', typescript: '^6.0.0' },
      files: './files',
      atlas: [],
      ...opts.preset,
    }),
  });

  for (const [path, content] of Object.entries(
    opts.files ?? {
      'src/index.ts': 'export const value = 1;\n',
      '.configs/lints/eslint.config.mjs': `import { houseConfigs } from '${ALLOWED_PACKAGE}/linters';\nexport default houseConfigs;\n`,
    },
  )) {
    writeText({ root: presetDir, path: join('files', path), content });
  }

  return presetDir;
};

/** The repository built once; every real-preset test reads this output. */
const outDir = join(scratch, 'built');
VulcanPreset.build({ root: ROOT, outDir });
const sharedDir = join(outDir, 'shared');
const sharedFiles = (): string[] => listFiles({ dir: join(sharedDir, 'files') });
const readShared = (opts: { path: string }): string =>
  readFileSync(join(sharedDir, 'files', opts.path), 'utf8');

describe('shared preset - the manifest and the build (P2)', () => {
  const manifest = readJson({ file: join(ROOT, 'packages/core-server/package.json') });
  const presets = (manifest.vulcan as { presets: Record<string, string> }).presets;

  test('vulcan.presets names exactly app, lib and shared, each under dist/presets/<kind>', () => {
    expect(Object.keys(presets).sort()).toEqual(KINDS);

    for (const kind of KINDS) {
      expect(presets[kind]).toBe(`./dist/presets/${kind}/preset.json`);
    }
  });

  test('each kind has its source preset.json, and the build writes each named file', () => {
    for (const kind of KINDS) {
      expect(existsSync(join(ROOT, 'presets', kind, 'preset.json'))).toBe(true);
      expect(existsSync(join(outDir, kind, 'preset.json'))).toBe(true);
    }
  });
});

describe('shared preset - no IGNIS or ARDOR dependency (P3)', () => {
  test('the built shared preset names no @venizia package but dev-configs as a devDependency', () => {
    expect(findNeutralityViolations({ presetDir: sharedDir })).toEqual([]);

    const preset = readJson({ file: join(sharedDir, 'preset.json') });

    expect(preset.dependencies).toEqual({});
    expect(preset.peerDependencies).toEqual({});
    expect(Object.keys(preset.devDependencies as object)).toContain(ALLOWED_PACKAGE);
  });

  test('control: the clean fixture passes', () => {
    expect(findNeutralityViolations({ presetDir: makeFixturePreset({}) })).toEqual([]);
  });

  test('control: a map that lists @venizia/ignis fails', () => {
    for (const map of ['dependencies', 'devDependencies', 'peerDependencies', 'peers']) {
      const presetDir = makeFixturePreset({ preset: { [map]: { '@venizia/ignis': '1.0.0' } } });

      expect(findNeutralityViolations({ presetDir })).toEqual([
        `preset.json ${map}: @venizia/ignis`,
      ]);
    }
  });

  test('control: a package that starts with @venizia/ignis or @venizia/ardor fails', () => {
    const presetDir = makeFixturePreset({
      preset: { dependencies: { '@venizia/ignis-kernel': '1.0.0', '@venizia/ardor': '1.0.0' } },
    });

    expect(findNeutralityViolations({ presetDir })).toHaveLength(2);
  });

  test('control: a package of a new name fails, so a new package cannot slip in', () => {
    const presetDir = makeFixturePreset({
      preset: { devDependencies: { '@venizia/some-new-package': '1.0.0' } },
    });

    expect(findNeutralityViolations({ presetDir })).toEqual([
      'preset.json devDependencies: @venizia/some-new-package',
    ]);
  });

  test('control: dev-configs as a dependency or a peer fails (devDependency only)', () => {
    for (const map of ['dependencies', 'peerDependencies']) {
      const presetDir = makeFixturePreset({ preset: { [map]: { [ALLOWED_PACKAGE]: '1.0.0' } } });

      expect(findNeutralityViolations({ presetDir })).toEqual([
        `preset.json ${map}: ${ALLOWED_PACKAGE}`,
      ]);
    }
  });

  test('control: a file that imports @venizia/ardor-react fails, in every import form', () => {
    const forms = [
      "import { Button } from '@venizia/ardor-react';",
      "import '@venizia/ardor-react';",
      "export * from '@venizia/ardor-react';",
      "const lazy = await import('@venizia/ardor-react');",
      "const loaded = require('@venizia/ardor-react');",
    ];

    for (const form of forms) {
      const presetDir = makeFixturePreset({ files: { 'src/index.ts': `${form}\n` } });

      expect(findNeutralityViolations({ presetDir })).toEqual([
        'files/src/index.ts imports @venizia/ardor-react',
      ]);
    }
  });

  test('control: src may not import dev-configs, only the tooling under .configs/ may', () => {
    const presetDir = makeFixturePreset({
      files: { 'src/index.ts': `import { x } from '${ALLOWED_PACKAGE}/linters';\n` },
    });

    expect(findNeutralityViolations({ presetDir })).toEqual([
      `files/src/index.ts imports ${ALLOWED_PACKAGE}/linters`,
    ]);
  });

  test('control: a tooling file that imports @venizia/ignis fails', () => {
    const presetDir = makeFixturePreset({
      files: { '.configs/lints/eslint.config.mjs': "import x from '@venizia/ignis';\n" },
    });

    expect(findNeutralityViolations({ presetDir })).toEqual([
      'files/.configs/lints/eslint.config.mjs imports @venizia/ignis',
    ]);
  });

  test('control: a name in a comment is not an import', () => {
    const presetDir = makeFixturePreset({
      files: { 'src/index.ts': "// import { x } from '@venizia/ignis';\nexport const y = 1;\n" },
    });

    expect(findNeutralityViolations({ presetDir })).toEqual([]);
  });
});

describe('shared preset - tokens (P4)', () => {
  const tokenPattern = /\{\{(\w+)\}\}/g;
  const tokensOf = (opts: { text: string }): string[] =>
    [...opts.text.matchAll(tokenPattern)].map((match) => match[1] ?? '');

  test('every token is project, shared or package, each appears, and package is in src/index.ts', () => {
    const found = new Set<string>();

    for (const path of sharedFiles()) {
      for (const token of tokensOf({ text: readShared({ path }) })) {
        expect(SHARED_TOKENS).toContain(token);
        found.add(token);
      }
    }

    expect([...found].sort()).toEqual([...SHARED_TOKENS].sort());
    expect(tokensOf({ text: readShared({ path: 'src/index.ts' }) })).toContain('package');
  });

  test('the lib token is not used in a shared package', () => {
    for (const path of sharedFiles()) {
      expect(readShared({ path })).not.toContain('{{lib}}');
    }
  });
});

describe('shared preset - VULCAN kind-file rules, a local copy of lib-preset.ts (P5)', () => {
  // A copy cannot see drift in VULCAN: the real check is `vulcan add --shared` (slice S2).
  const ALLOWED_KEYS = [
    'presetVersion',
    'summary',
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'scripts',
    'checks',
    'imports',
    'exports',
    'packageFields',
    'files',
    'atlas',
  ];
  const ALLOWED_PACKAGE_FIELDS = ['type', 'sideEffects', 'browser', 'engines'];

  const findKindFileProblems = (opts: { presetDir: string }): string[] => {
    const problems: string[] = [];
    const preset = readJson({ file: join(opts.presetDir, 'preset.json') });

    for (const key of Object.keys(preset)) {
      if (!ALLOWED_KEYS.includes(key)) {
        problems.push(`unknown key ${key}`);
      }
    }

    if (preset.presetVersion !== 1) {
      problems.push('presetVersion is not 1');
    }

    if (typeof preset.summary !== 'string' || preset.summary === '') {
      problems.push('summary is missing');
    }

    const scripts = (preset.scripts ?? {}) as Record<string, unknown>;

    for (const check of (preset.checks ?? []) as string[]) {
      if (!Object.hasOwn(scripts, check)) {
        problems.push(`check ${check} is not a key of scripts`);
      }
    }

    for (const key of Object.keys((preset.imports ?? {}) as object)) {
      if (!key.startsWith('#')) {
        problems.push(`imports key ${key} does not start with #`);
      }
    }

    for (const key of Object.keys((preset.packageFields ?? {}) as object)) {
      if (!ALLOWED_PACKAGE_FIELDS.includes(key)) {
        problems.push(`packageFields key ${key} is not allowed`);
      }
    }

    if (typeof preset.files !== 'string') {
      problems.push('files is missing');
    } else {
      const files = resolve(opts.presetDir, preset.files);
      const outside = relative(opts.presetDir, files);

      if (isAbsolute(outside) || outside === '..' || outside.startsWith(`..${sep}`)) {
        problems.push('files points outside the package');
      } else if (!existsSync(files)) {
        problems.push('files folder is missing');
      }
    }

    if (!Array.isArray(preset.atlas ?? [])) {
      problems.push('atlas is not a list');
    }

    return problems;
  };

  test('the built shared preset passes, has no app-only key, and an empty atlas', () => {
    expect(findKindFileProblems({ presetDir: sharedDir })).toEqual([]);

    const preset = readJson({ file: join(sharedDir, 'preset.json') });

    for (const key of ['side', 'devPort', 'urls', 'peers']) {
      expect(preset).not.toHaveProperty(key);
    }

    expect(preset.presetVersion).toBe(1);
    expect(preset.atlas).toEqual([]);
    expect(preset.files).toBe('./files');
    expect(preset.checks).toEqual(['typecheck', 'lint', 'test']);
    expect(preset.exports).toEqual({ '.': './src/index.ts' });
  });

  test('every dependency marker is resolved in the built shared preset', () => {
    const text = readFileSync(join(sharedDir, 'preset.json'), 'utf8');

    expect(text).not.toContain('workspace:');
    expect(text).not.toContain('catalog:');
  });

  test('control: each rule fails on a preset that breaks it', () => {
    const broken: [Record<string, unknown>, string][] = [
      [{ side: 'backend' }, 'unknown key side'],
      [{ devPort: 3000 }, 'unknown key devPort'],
      [{ summary: '' }, 'summary is missing'],
      [{ presetVersion: 2 }, 'presetVersion is not 1'],
      [{ scripts: {}, checks: ['test'] }, 'check test is not a key of scripts'],
      [{ imports: { 'src/*': './src/*' } }, 'imports key src/* does not start with #'],
      [{ packageFields: { exports: {} } }, 'packageFields key exports is not allowed'],
      [{ files: '../elsewhere' }, 'files points outside the package'],
      [{ files: './missing' }, 'files folder is missing'],
    ];

    for (const [change, problem] of broken) {
      const presetDir = makeFixturePreset({ preset: change });

      expect(findKindFileProblems({ presetDir })).toContain(problem);
    }
  });
});

describe('shared preset - tsconfig and src stay neutral (P6)', () => {
  const findBunUsage = (opts: { source: string }): string[] => {
    const code = stripComments({ source: opts.source });

    return [
      ...(/\bBun\s*\./.test(code) ? ['Bun.'] : []),
      ...(/['"]bun:/.test(code) ? ['bun:'] : []),
      ...(/\bimport\.meta\.(dir|dirname|file|path)\b/.test(code) ? ['import.meta (Bun)'] : []),
    ];
  };

  test('tsconfig.json extends nothing, enables no decorators and has no DOM lib', () => {
    const tsconfig = readJson({ file: join(sharedDir, 'files/tsconfig.json') });
    const options = tsconfig.compilerOptions as Record<string, unknown>;

    expect(tsconfig).not.toHaveProperty('extends');
    expect(options.experimentalDecorators).not.toBe(true);
    expect(options.emitDecoratorMetadata).not.toBe(true);
    expect((options.lib as string[]).filter((entry) => /dom|webworker/i.test(entry))).toEqual([]);
    expect(options.strict).toBe(true);
    expect(options.noEmit).toBe(true);
  });

  test('no file under src, the test aside, calls a Bun API or imports bun:*', () => {
    const sources = sharedFiles().filter(
      (path) => path.startsWith('src/') && !path.endsWith('.test.ts'),
    );

    expect(sources).toContain('src/index.ts');

    for (const path of sources) {
      expect(findBunUsage({ source: readShared({ path }) })).toEqual([]);
    }
  });

  test('control: the Bun usage check catches a call, an import and a comment-only mention passes', () => {
    expect(findBunUsage({ source: 'export const a = Bun.file("x");' })).toEqual(['Bun.']);
    expect(findBunUsage({ source: "import { test } from 'bun:test';" })).toEqual(['bun:']);
    expect(findBunUsage({ source: 'const d = import.meta.dir;' })).toEqual(['import.meta (Bun)']);
    expect(findBunUsage({ source: '// no Bun.file here\nexport const a = 1;' })).toEqual([]);
  });
});

describe('shared preset - the rendered package runs (P7)', () => {
  const TOKEN_VALUES: Record<string, string> = {
    project: 'demo',
    shared: 'common',
    package: '@demo/common',
  };

  /** Copies the built shared files into a fresh folder with the three tokens replaced. */
  const render = (): string => {
    const folder = freshFolder();

    for (const path of sharedFiles()) {
      if (path.startsWith('.configs/')) {
        continue;
      }

      const source = join(sharedDir, 'files', path);

      if (!existsSync(source) || readFileSync(source).includes(0)) {
        continue;
      }

      writeText({
        root: folder,
        path,
        content: readFileSync(source, 'utf8').replace(
          /\{\{(project|shared|package)\}\}/g,
          (_token, name: string) => TOKEN_VALUES[name] ?? '',
        ),
      });
    }

    return folder;
  };

  const runTests = (opts: { cwd: string }): { exitCode: number; output: string } => {
    const result = Bun.spawnSync(['bun', 'test'], {
      cwd: opts.cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    return {
      exitCode: result.exitCode,
      output: `${result.stdout.toString()}${result.stderr.toString()}`,
    };
  };

  test('the rendered files have no token left, and bun test passes with no install', () => {
    const folder = render();

    for (const path of listFiles({ dir: folder })) {
      expect(readFileSync(join(folder, path), 'utf8')).not.toContain('{{');
    }

    const { exitCode, output } = runTests({ cwd: folder });

    expect(output).toContain('1 pass');
    expect(exitCode).toBe(0);
  });

  test('control: a rendered package whose test fails makes the run fail', () => {
    const folder = render();

    writeText({
      root: folder,
      path: 'src/index.test.ts',
      content:
        "import { expect, test } from 'bun:test';\ntest('fails', () => {\n  expect(1).toBe(2);\n});\n",
    });

    expect(runTests({ cwd: folder }).exitCode).not.toBe(0);
  });
});

describe('lib preset - the word shared names only the shared kind (P9)', () => {
  test('the lib summary does not call the lib shared', () => {
    const lib = readJson({ file: join(ROOT, 'presets/lib/preset.json') });

    expect(lib.summary).toBeString();
    expect(lib.summary as string).not.toMatch(/shared/i);
  });
});

describe('shared preset - the lint configs (P12, P13)', () => {
  const lintFolder = '.configs/lints';
  const readBuilt = (opts: { kind: string; path: string }): string =>
    readFileSync(join(outDir, opts.kind, 'files', opts.path), 'utf8');

  test('the shared kind gets exactly the lint and format files the lib gets, from the app', () => {
    const under = (opts: { kind: string }): string[] =>
      listFiles({ dir: join(outDir, opts.kind, 'files') }).filter(
        (path) => path.startsWith(lintFolder) || path.startsWith('.configs/formatters'),
      );

    expect(under({ kind: 'shared' })).toEqual(under({ kind: 'lib' }));
    expect(under({ kind: 'shared' })).toContain(`${lintFolder}/eslint.config.mjs`);
    expect(under({ kind: 'shared' })).toContain(`${lintFolder}/oxlint.config.mts`);

    for (const path of under({ kind: 'shared' })) {
      expect(readBuilt({ kind: 'shared', path })).toBe(readBuilt({ kind: 'app', path }));
    }

    // The shared kind's own source adds no lint rule: nothing of it sits under .configs/.
    expect(
      listFiles({ dir: join(ROOT, 'presets/shared/files') }).filter((path) =>
        path.startsWith('.configs'),
      ),
    ).toEqual([]);
  });

  test('the two configs only re-export the base presets of dev-configs', () => {
    const eslintSpecifiers = readSpecifiers({
      source: readBuilt({ kind: 'shared', path: `${lintFolder}/eslint.config.mjs` }),
    });
    const oxlintSpecifiers = readSpecifiers({
      source: readBuilt({ kind: 'shared', path: `${lintFolder}/oxlint.config.mts` }),
    });

    expect(eslintSpecifiers).toEqual([`${ALLOWED_PACKAGE}/linters`]);
    expect(oxlintSpecifiers).toEqual(['oxlint', `${ALLOWED_PACKAGE}/linters/oxlint`]);
    expect(readBuilt({ kind: 'shared', path: `${lintFolder}/eslint.config.mjs` })).toMatch(
      /export default houseConfigs;/,
    );
    expect(readBuilt({ kind: 'shared', path: `${lintFolder}/oxlint.config.mts` })).toMatch(
      /export default defineConfig\(oxlintConfigs\);/,
    );
  });

  // A rule name of the React, DOM, Hono, Drizzle or decorator families, found in a quoted string.
  const SIDE_ONLY_NAME = /react|hono|drizzle|decorator|jsx-a11y/i;
  const findSideOnlyNames = (opts: { source: string }): string[] =>
    [...stripComments({ source: opts.source }).matchAll(/'([^'\n]+)'/g)]
      .map((match) => match[1] ?? '')
      .filter((name) => SIDE_ONLY_NAME.test(name));

  test('the base presets the configs import name no backend-only or frontend-only rule', () => {
    for (const file of ['eslint.ts', 'oxlint.ts']) {
      const source = readFileSync(join(ROOT, 'packages/dev-configs/src/linters', file), 'utf8');

      expect(source.length).toBeGreaterThan(0);
      expect(findSideOnlyNames({ source })).toEqual([]);
    }
  });

  test('houseConfigs is the naming convention and the house rules, never the React presets', () => {
    const source = readFileSync(
      join(ROOT, 'packages/dev-configs/src/linters/house/configs.ts'),
      'utf8',
    );
    const line = /export const houseConfigs[^=]*=\s*\[([^\]]*)\]/.exec(source);

    expect(line?.[1]).toBeString();
    expect(line?.[1]).not.toMatch(/react/i);
  });

  test('control: the side-only name check catches a React, Hono, Drizzle or decorator rule', () => {
    for (const name of [
      'react-hooks/exhaustive-deps',
      'hono/no-x',
      'drizzle/enforce-x',
      'decorator-metadata',
    ]) {
      expect(findSideOnlyNames({ source: `const RULES = { '${name}': 'error' };` })).toEqual([
        name,
      ]);
    }

    expect(findSideOnlyNames({ source: "const RULES = { 'prefer-const': 'error' };" })).toEqual([]);
    expect(findSideOnlyNames({ source: "// 'react/x'\nconst RULES = {};" })).toEqual([]);
  });
});
