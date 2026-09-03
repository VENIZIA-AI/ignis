import type { AnyType } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

/**
 * The built package, not `src`: `tsc-alias` rewrites the `@/` aliases into relative paths, so a copy
 * of `dist` is self-contained, whereas a copy of `src` would resolve every alias back to the
 * original tree - one module graph wearing two hats.
 *
 * `__dirname`, not `import.meta`: this package emits CommonJS.
 */
const PACKAGE_ROOT = dirname(dirname(dirname(__dirname)));
/** `dist/cjs`, not `dist`: this package dual-builds, and the probe below copies the CommonJS half - `__dirname` and `require` are what it drives. */
const DIST_ROOT = join(PACKAGE_ROOT, 'dist', 'cjs');

/** Under `node_modules` so that `@venizia/ignis-helpers` and friends still resolve by walking up, and so nothing here is ever linted, type-checked or committed. */
const PROBE_ROOT = join(PACKAGE_ROOT, 'node_modules', '.singleton-realm-probe');

type TKernelModule = Record<string, AnyType>;

let copyA: TKernelModule;
let copyB: TKernelModule;

const installCopy = async (opts: { name: string }): Promise<TKernelModule> => {
  const target = join(PROBE_ROOT, opts.name);

  rmSync(target, { recursive: true, force: true });
  cpSync(DIST_ROOT, target, { recursive: true });

  return (await import(join(target, 'index.js'))) as TKernelModule;
};

/**
 * Two copies of `@venizia/ignis-kernel` in one install is not hypothetical and needs nobody to
 * change a package: `@venizia/ignis` and `@venizia/ignis-connectors` each pin a range, and the day
 * those stop intersecting a package manager nests a second copy rather than failing. Module-level
 * statics then split in two and NOTHING THROWS - `@repository` writes into one `datasourceModels`
 * map while `discoverSchema()` reads the other, `buildSchema()` returns `{}`, and every query fails
 * for a reason that points nowhere near the cause.
 *
 * Calling `SingletonRealm.resolve` once inside one module graph proves none of that: the answer is
 * trivially consistent with itself. The assertions below drive TWO genuinely separate graphs of the
 * built package, and the first test is what makes the rest mean anything - if the two copies were
 * secretly one module, every later assertion would pass for the wrong reason.
 */
describe('a second copy of the kernel is harmless, not forbidden', () => {
  beforeAll(async () => {
    if (!existsSync(join(DIST_ROOT, 'index.js'))) {
      throw getError({
        message: `[singleton-realm.test] ${DIST_ROOT}/index.js is missing - this test drives the BUILT package. Run \`make kernel\` first.`,
      });
    }

    copyA = await installCopy({ name: 'copy-a' });
    copyB = await installCopy({ name: 'copy-b' });
  });

  afterAll(() => {
    rmSync(PROBE_ROOT, { recursive: true, force: true });
  });

  test('the two copies really are two module graphs - every class identity differs', () => {
    expect(copyA).not.toBe(copyB);

    for (const name of [
      'MetadataRegistry',
      'AuthenticationStrategyRegistry',
      'AuthorizationEnforcerRegistry',
      'GrantBuilder',
      'RequestContextRegistry',
      'AbstractDataSource',
    ]) {
      expect(typeof copyA[name]).toBe('function');
      expect(copyA[name]).not.toBe(copyB[name]);
    }
  });

  test.each([
    ['MetadataRegistry'],
    ['AuthenticationStrategyRegistry'],
    ['AuthorizationEnforcerRegistry'],
    ['GrantBuilder'],
  ])('%s resolves to ONE instance across both copies', name => {
    const fromA = copyA[name].getInstance();
    const fromB = copyB[name].getInstance();

    expect(fromA).toBe(fromB);
  });

  test('metadata written through one copy is readable through the other', () => {
    class Note {}
    class NoteRepository {}
    class ProbeDataSource {}

    copyA.MetadataRegistry.getInstance().registerRepositoryBinding({
      model: Note,
      repository: NoteRepository,
      dataSource: ProbeDataSource,
    });

    const modelClasses = copyB.MetadataRegistry.getInstance().getModelClasses({
      dataSource: ProbeDataSource,
    });

    // The exact failure the anchoring exists to prevent: this comes back empty when each copy keeps
    // its own map, and nothing anywhere reports an error.
    expect(modelClasses).toContain(Note);
  });

  test('the request-context resolver crosses copies in both directions', () => {
    const context = { marker: 'cross-copy' };

    copyA.RequestContextRegistry.setResolver({ resolver: () => context });
    expect(copyB.RequestContextRegistry.resolve()).toBe(context);

    copyB.RequestContextRegistry.clearResolver();
    expect(copyA.RequestContextRegistry.resolve()).toBeUndefined();
  });

  /**
   * Anchoring cannot save class identity - two copies are two classes - so the fix for
   * `@repository`'s first-parameter check was to stop asking for identity at all. This is the pair
   * that discriminates: the retired check and its replacement, on the same class, disagreeing.
   */
  test('isDataSourceClass sees across copies where instanceof cannot', () => {
    class ProbeDataSource extends copyA.AbstractDataSource {
      configure(): void {}
    }

    expect(copyA.isDataSourceClass(ProbeDataSource)).toBe(true);
    expect(copyB.isDataSourceClass(ProbeDataSource)).toBe(true);

    // The retired check, kept here as the control: it is FALSE for a perfectly valid datasource
    // registered against the other copy, which is exactly how it rejected one at import time.
    expect(ProbeDataSource.prototype instanceof copyB.AbstractDataSource).toBe(false);
    expect(ProbeDataSource.prototype instanceof copyA.AbstractDataSource).toBe(true);
  });

  test('isDataSourceClass rejects what is not a datasource class, so it is not a blanket true', () => {
    class Unrelated {}

    expect(copyB.isDataSourceClass(Unrelated)).toBe(false);
    expect(copyB.isDataSourceClass(undefined)).toBe(false);
    expect(copyB.isDataSourceClass({})).toBe(false);
    expect(copyB.isDataSourceClass(copyA.AbstractDataSource)).toBe(true);
  });

  /** `in`, never a truthiness check: a holder whose only field is still `undefined` is a legitimate resolved value, and re-creating it would hand every caller a fresh slot. */
  test('a singleton whose state is still undefined is not re-created on the next call', () => {
    copyA.RequestContextRegistry.clearResolver();

    const context = { marker: 'survives-an-undefined-slot' };
    copyB.RequestContextRegistry.setResolver({ resolver: () => context });

    expect(copyA.RequestContextRegistry.resolve()).toBe(context);

    copyA.RequestContextRegistry.clearResolver();
  });
});
