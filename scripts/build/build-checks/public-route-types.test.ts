import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';
import ts from 'typescript';

/**
 * The type names a route's context adds to the built entry points. The helpers behind `TContextOf` stay in a module
 * no entry point re-exports. Reads the build; builds nothing.
 */

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');

const exportsOf = (entry: string) => {
  const path = join(REPO_ROOT, entry);
  const program = ts.createProgram([path], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(path);
  const symbol = source && checker.getSymbolAtLocation(source);

  return new Set(symbol ? checker.getExportsOfModule(symbol).map((item) => item.name) : []);
};

describe('the context types of a route, in the built entry points', () => {
  for (const entry of [
    'packages/kernel/dist/esm/index.d.ts',
    'packages/core-server/dist/esm/index.d.ts',
  ]) {
    test(entry, () => {
      const names = exportsOf(entry);

      for (const name of ['TContextOf', 'TRouteContext', 'TRouteHandler', 'TContext']) {
        expect(names.has(name), name).toBe(true);
      }

      for (const name of [
        'IRouteContext',
        'IRouteRequest',
        'TValidTarget',
        'IValidRequestProps',
        'TResponseBodyOf',
      ]) {
        expect(names.has(name), name).toBe(false);
      }
    });
  }
});
