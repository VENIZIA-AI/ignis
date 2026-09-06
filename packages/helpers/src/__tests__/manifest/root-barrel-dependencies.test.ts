import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

const PACKAGE_DIRECTORY = resolve(__dirname, '..', '..', '..');
const ROOT_BARREL = resolve(PACKAGE_DIRECTORY, 'src', 'index.ts');

/** Top-level static `import`/`export ... from` specifiers; a dynamic `import()` or `require()` inside a function is lazy and stays out on purpose. `@/` is the package's own `src` alias. */
const STATIC_SPECIFIER = /^(?:import|export)\s[^;]*?\sfrom\s+['"]([^'"]+)['"]/gm;
const BARE_IMPORT = /^import\s+['"]([^'"]+)['"]/gm;

const packageNameOf = (specifier: string): string => {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];
};

const resolveRelative = (opts: { from: string; specifier: string }): string | undefined => {
  const base = resolve(dirname(opts.from), opts.specifier);
  const candidates = [base, `${base}.ts`, resolve(base, 'index.ts')];
  return candidates.find(candidate => candidate.endsWith('.ts') && existsSync(candidate));
};

/** Every bare package the root barrel loads at import time, following relative imports transitively. */
const collectLoadTimePackages = (opts: { entry: string }): Set<string> => {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const queue = [opts.entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);

    const source = readFileSync(file, 'utf8');
    const specifiers = [...source.matchAll(STATIC_SPECIFIER), ...source.matchAll(BARE_IMPORT)].map(
      match => match[1],
    );

    for (const specifier of specifiers) {
      if (specifier.startsWith('.') || specifier.startsWith('@/')) {
        const target = specifier.startsWith('@/')
          ? resolve(PACKAGE_DIRECTORY, 'src', specifier.slice(2))
          : specifier;
        const next = resolveRelative({ from: file, specifier: target });
        if (next) {
          queue.push(next);
        }
        continue;
      }
      if (specifier.startsWith('node:') || builtinModules.includes(specifier)) {
        continue;
      }
      packages.add(packageNameOf(specifier));
    }
  }

  return packages;
};

describe('helpers manifest - the root barrel declares everything it loads', () => {
  test('every package the root barrel imports at load time is a dependency or a peer', () => {
    const manifest = JSON.parse(readFileSync(resolve(PACKAGE_DIRECTORY, 'package.json'), 'utf8'));
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);

    const loaded = collectLoadTimePackages({ entry: ROOT_BARREL });
    const undeclared = [...loaded].filter(name => !declared.has(name)).sort();

    expect(loaded.size).toBeGreaterThan(3);
    expect(undeclared).toEqual([]);
  });

  test('the walker sees through a relative re-export chain (positive control)', () => {
    const loaded = collectLoadTimePackages({ entry: ROOT_BARREL });

    expect(loaded.has('@hono/zod-openapi')).toBe(true);
    expect(loaded.has('zod')).toBe(true);
  });
});
