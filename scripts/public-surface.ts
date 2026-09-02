/**
 * Snapshot of every exported symbol (values and types) of every package `exports` entry, read
 * from the built `.d.ts` with the TypeScript compiler API. Frozen during the file split: `check`
 * fails when a symbol appears, disappears or changes kind. Usage: bun scripts/public-surface.ts
 * gen|check
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type * as TypeScript from 'typescript';

const REPO = resolve(import.meta.dir, '..');
const OUTPUT = resolve(REPO, '.agents/knowledge/reference/public-surface.md');
// Dependency order, so a diff reads bottom-up the way a release does.
const PACKAGES = [
  'inversion',
  'filter',
  'helpers',
  'boot',
  'kernel',
  'connectors',
  'core-server',
  'core-worker',
];
// The tooling keeps no dependency of its own; the compiler comes from a package that already has
// it.
const ts: typeof TypeScript = createRequire(
  resolve(REPO, 'packages/boot/package.json'),
)('typescript');

interface IEntrySurface {
  entry: string;
  symbols: { name: string; kind: string }[];
}

export class PublicSurface {
  static render(): string {
    const sections = PACKAGES.map(name => PublicSurface.renderPackage({ name }));
    return [
      '---',
      'type: Reference',
      'title: Public surface',
      'description: Every exported symbol of every package exports entry, from the built .d.ts ' +
        '(generated).',
      'resource: packages',
      'tags: [reference, exports, api]',
      '---',
      '',
      '> Generated from dist - do not edit; run `make surface-gen` after an intentional API ' +
        'change. A wave of the file split must leave this file untouched.',
      '',
      ...sections,
      '',
    ].join('\n');
  }

  static check(): boolean {
    const expected = PublicSurface.render();
    const actual = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : '';
    return PublicSurface.normalize(expected) === PublicSurface.normalize(actual);
  }

  private static renderPackage(opts: { name: string }): string {
    const dir = resolve(REPO, 'packages', opts.name);
    const manifest = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')) as {
      name: string;
      exports: Record<string, string | { types?: string }>;
    };
    const entries = Object.entries(manifest.exports)
      .filter(([entry]) => !entry.endsWith('.json'))
      .map(([entry, target]) => ({
        entry,
        types: typeof target === 'string' ? target : target.types,
      }))
      .filter((item): item is { entry: string; types: string } => Boolean(item.types));

    const surfaces = entries.map(item =>
      PublicSurface.surfaceOf({ entry: item.entry, file: resolve(dir, item.types) }),
    );
    const lines = surfaces.flatMap(surface => {
      const suffix = surface.entry === '.' ? '' : surface.entry.slice(1);
      return [
        `### \`${manifest.name}${suffix}\` (${surface.symbols.length})`,
        '',
        ...surface.symbols.map(symbol => `- \`${symbol.name}\` ${symbol.kind}`),
        '',
      ];
    });

    return [`## ${opts.name}`, '', ...lines].join('\n');
  }

  private static surfaceOf(opts: { entry: string; file: string }): IEntrySurface {
    if (!existsSync(opts.file)) {
      throw new Error(`[public-surface] ${opts.file} does not exist - build the package first`);
    }
    const program = ts.createProgram([opts.file], {
      skipLibCheck: true,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    });
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(opts.file);
    const moduleSymbol = source ? checker.getSymbolAtLocation(source) : undefined;
    if (!moduleSymbol) {
      throw new Error(`[public-surface] ${opts.file} is not a module`);
    }

    const symbols = checker
      .getExportsOfModule(moduleSymbol)
      .map(symbol => ({ name: symbol.getName(), kind: PublicSurface.kindOf({ checker, symbol }) }))
      .sort((left, right) => left.name.localeCompare(right.name));

    return { entry: opts.entry, symbols };
  }

  private static kindOf(opts: {
    checker: TypeScript.TypeChecker;
    symbol: TypeScript.Symbol;
  }): string {
    const resolved = opts.symbol.flags & ts.SymbolFlags.Alias
      ? opts.checker.getAliasedSymbol(opts.symbol)
      : opts.symbol;
    const flags = resolved.flags;
    if (flags & ts.SymbolFlags.Class) {
      return 'class';
    }
    if (flags & ts.SymbolFlags.Interface) {
      return 'interface';
    }
    if (flags & ts.SymbolFlags.TypeAlias) {
      return 'type';
    }
    if (flags & ts.SymbolFlags.Enum) {
      return 'enum';
    }
    if (flags & ts.SymbolFlags.Function) {
      return 'function';
    }
    if (flags & ts.SymbolFlags.Variable) {
      return 'const';
    }
    if (flags & ts.SymbolFlags.Module) {
      return 'namespace';
    }
    return 'other';
  }

  private static normalize(text: string): string {
    return text
      .split('\n')
      .map(line => line.replace(/\s+$/, ''))
      .join('\n')
      .trim();
  }
}

const run = (): number => {
  switch (process.argv[2]) {
    case 'gen': {
      writeFileSync(OUTPUT, PublicSurface.render());
      console.log(`wrote ${OUTPUT}`);
      return 0;
    }
    case 'check': {
      if (PublicSurface.check()) {
        console.log('fresh .agents/knowledge/reference/public-surface.md');
        return 0;
      }
      console.error(
        'stale .agents/knowledge/reference/public-surface.md - the public surface changed; ' +
          'run `make surface-gen` only if the change is intended',
      );
      return 1;
    }
    default: {
      console.error('usage: bun scripts/public-surface.ts gen|check');
      return 2;
    }
  }
};

if (import.meta.main) {
  process.exit(run());
}
