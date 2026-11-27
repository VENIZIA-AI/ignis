import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';

/**
 * The type names a route's context adds to the built entry points. The helpers behind `TContextOf` stay in a module
 * no entry point re-exports. Reads the build; builds nothing. A release job builds one package and what it depends on,
 * so an entry that is not built there is skipped, and the job that builds it checks it.
 */

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');
const TYPES_BARREL = 'packages/kernel/dist/esm/base/controllers/common/types/index.d.ts';

const isBuilt = (entry: string) => existsSync(join(REPO_ROOT, entry));

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
  test.skipIf(!isBuilt(TYPES_BARREL))(
    'the controller types barrel exports exactly these names',
    () => {
      const names = exportsOf(TYPES_BARREL);

      expect([...names].sort()).toEqual([
        'IAuthRouteConfig',
        'IBindRouteOptions',
        'IController',
        'IControllerOptions',
        'ICrudControllerOptions',
        'ICustomizableRoutes',
        'IDefineRouteOptions',
        'TContext',
        'TContextOf',
        'TCountResponse',
        'TCrudRepositoryClass',
        'TCrudRoutes',
        'TCustomizableRouteConfig',
        'TEntityDataObject',
        'TEntityPersistObject',
        'TJsonResponse',
        'TRepositoryDataObject',
        'TRepositoryPersistObject',
        'TResponseHeaderObject',
        'TResponseHeaders',
        'TRouteAuthConfig',
        'TRouteAuthenticateConfig',
        'TRouteAuthorizeConfig',
        'TRouteContext',
        'TRouteHandler',
      ]);
    },
  );

  for (const entry of [
    'packages/kernel/dist/esm/index.d.ts',
    'packages/core-server/dist/esm/index.d.ts',
  ]) {
    test.skipIf(!isBuilt(entry))(entry, () => {
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
