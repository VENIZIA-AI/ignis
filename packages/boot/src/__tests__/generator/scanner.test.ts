import { ArtifactStereotypes } from '@/generator/common';
import { ArtifactScanner } from '@/generator/scanner';
import { describe, expect, spyOn, test } from 'bun:test';
import { StereotypeReexportResolver } from '@/generator/reexport';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'artifacts');
const REEXPORT_APP = resolve(
  process.cwd(),
  'src',
  '__tests__',
  'fixtures',
  'reexport',
  'app',
  'src',
);

describe('ArtifactScanner', () => {
  test('finds every exported class carrying an IGNIS stereotype, and nothing else', () => {
    expect(
      ArtifactScanner.getInstance()
        .scan({ root: ROOT })
        .map(a => `${a.type}:${a.className}`),
    ).toEqual([
      'component:ProbeComponent',
      'configuration:LateConfiguration',
      'configuration:ProbeConfiguration',
      'controller:ProbeController',
      'datasource:ProbeDataSource',
      'model:ProbeModel',
      'repository:ProbeRepository',
      'service:AliasedService',
      'service:GreeterService',
      'service:InjectableService',
      'service:LateExportService',
    ]);
  });

  test('undecorated, abstract, unexported, foreign-decorated, __tests__ and generated/ classes are excluded', () => {
    const names = ArtifactScanner.getInstance()
      .scan({ root: ROOT })
      .map(a => a.className);

    const excludeds = [
      'PlainService',
      'AbstractService',
      'HiddenService',
      'ForeignService',
      'IgnoredService',
    ];
    for (const excluded of excludeds) {
      expect(names).not.toContain(excluded);
    }
  });

  test('a source module the caller names adds to the defaults: its stereotypes count, IGNIS ones still do', () => {
    const names = ArtifactScanner.getInstance()
      .scan({ root: ROOT, sourceModules: ['some-other-lib'] })
      .map(a => a.className);

    expect(names).toContain('ForeignService');
    expect(names).toContain('GreeterService');
  });

  test('a source module matches its specifier exactly, never a prefix', () => {
    const names = ArtifactScanner.getInstance()
      .scan({ root: ROOT, sourceModules: ['some-other'] })
      .map(a => a.className);

    expect(names).not.toContain('ForeignService');
  });

  test('a caller-supplied ignore list adds to the defaults, never replaces them', () => {
    const names = ArtifactScanner.getInstance()
      .scan({ root: ROOT, ignore: ['**/legacy/**'] })
      .map(a => a.className);

    expect(names).not.toContain('IgnoredService');
  });

  test('deterministic: two scans are identical; filePath is absolute', () => {
    const first = ArtifactScanner.getInstance().scan({ root: ROOT });

    expect(ArtifactScanner.getInstance().scan({ root: ROOT })).toEqual(first);
    expect(first.find(a => a.className === 'GreeterService')?.filePath).toBe(
      join(ROOT, 'services', 'greeter.service.ts'),
    );
  });
});

describe('ArtifactScanner - followReexports', () => {
  test('a stereotype reached through a chain of re-exports (export *, then a renaming export) counts', () => {
    const { artifacts } = ArtifactScanner.getInstance().scanWithReport({
      root: REEXPORT_APP,
      followReexports: true,
    });
    expect(artifacts.map(a => `${a.type}:${a.className}`)).toContain('service:KitService');
  });

  test('without followReexports the re-exported stereotype is not recognised (positive control)', () => {
    const { artifacts } = ArtifactScanner.getInstance().scanWithReport({ root: REEXPORT_APP });
    expect(artifacts.map(a => a.className)).not.toContain('KitService');
  });

  test('a decorator from a module that does not lead to the kernel still does not count', () => {
    const { artifacts } = ArtifactScanner.getInstance().scanWithReport({
      root: REEXPORT_APP,
      followReexports: true,
    });
    expect(artifacts.map(a => a.className)).not.toContain('StillForeignService');
  });

  test('a class re-exported by a barrel is never registered from the barrel', () => {
    const { artifacts } = ArtifactScanner.getInstance().scanWithReport({
      root: REEXPORT_APP,
      followReexports: true,
    });
    expect(artifacts.map(a => a.className)).not.toContain('GreeterService');
  });
});

describe('ArtifactScanner - skipped report', () => {
  test('every decorated class left out is listed with its reason', () => {
    const { skipped } = ArtifactScanner.getInstance().scanWithReport({ root: ROOT });
    expect(skipped).toContainEqual(
      expect.objectContaining({ className: 'AbstractService', reason: 'abstract' }),
    );
    expect(skipped).toContainEqual(
      expect.objectContaining({ className: 'HiddenService', reason: 'not-exported' }),
    );
  });

  test('a class hidden by a user ignore pattern is listed as ignored', () => {
    const { skipped } = ArtifactScanner.getInstance().scanWithReport({
      root: ROOT,
      ignore: ['services/greeter.service.ts'],
    });
    expect(skipped).toContainEqual(
      expect.objectContaining({ className: 'GreeterService', reason: 'ignored' }),
    );
  });
});

describe('ArtifactScanner - followReexports cost', () => {
  test('only an import used as a class decorator is followed, never a plain value import', () => {
    const originOf = spyOn(StereotypeReexportResolver.prototype, 'originOf');
    const { artifacts } = ArtifactScanner.getInstance().scanWithReport({
      root: REEXPORT_APP,
      followReexports: true,
    });

    expect(artifacts.map(a => a.className)).toContain('MixedService');
    expect(originOf.mock.calls.map(([opts]) => opts.name)).not.toContain('helper');
    originOf.mockRestore();
  });
});

describe('ArtifactScanner - kernel sub-paths', () => {
  test('a re-export from a kernel sub-path (@venizia/ignis-kernel/metadata) counts', () => {
    const { artifacts } = ArtifactScanner.getInstance().scanWithReport({
      root: REEXPORT_APP,
      followReexports: true,
    });
    expect(artifacts.map(a => a.className)).toContain('SubpathService');
  });

  test('a sibling package sharing the prefix (@venizia/ignis-boot) is not a source module', () => {
    expect(ArtifactStereotypes.SOURCE_MODULES.test('@venizia/ignis-boot')).toBe(false);
    expect(ArtifactStereotypes.SOURCE_MODULES.test('@venizia/ignis-helpers/common')).toBe(false);
    expect(ArtifactStereotypes.SOURCE_MODULES.test('@venizia/ignis-kernel/metadata')).toBe(true);
  });
});
