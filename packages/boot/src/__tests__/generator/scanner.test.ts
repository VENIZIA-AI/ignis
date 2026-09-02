import { ArtifactScanner } from '@/generator/scanner';
import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'artifacts');

describe('ArtifactScanner', () => {
  test('finds every exported class carrying an IGNIS stereotype, and nothing else', () => {
    expect(
      ArtifactScanner.getInstance()
        .scan({ root: ROOT })
        .map(a => `${a.type}:${a.className}`),
    ).toEqual([
      'component:ProbeComponent',
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

    for (const excluded of [
      'PlainService',
      'AbstractService',
      'HiddenService',
      'ForeignService',
      'IgnoredService',
    ]) {
      expect(names).not.toContain(excluded);
    }
  });

  test('deterministic: two scans are identical; filePath is absolute', () => {
    const first = ArtifactScanner.getInstance().scan({ root: ROOT });

    expect(ArtifactScanner.getInstance().scan({ root: ROOT })).toEqual(first);
    expect(first.find(a => a.className === 'GreeterService')?.filePath).toBe(
      join(ROOT, 'services', 'greeter.service.ts'),
    );
  });
});
