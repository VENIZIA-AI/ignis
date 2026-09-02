import type { IScannedArtifact } from '@/generator/common/types';
import { ArtifactIndexEmitter } from '@/generator/emitter';
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const ROOT = '/repo/app/src';
const artifact = (
  type: IScannedArtifact['type'],
  className: string,
  relative: string,
): IScannedArtifact => ({ type, className, filePath: join(ROOT, relative) });

describe('ArtifactIndexEmitter', () => {
  test('renders sorted imports, the fixed field order, empty arrays for missing kinds, and never a model', () => {
    const content = ArtifactIndexEmitter.render({
      outFile: join(ROOT, 'generated', 'artifacts.ts'),
      exportName: 'GeneratedArtifacts',
      artifacts: [
        artifact('service', 'ZetaService', 'services/zeta.service.ts'),
        artifact('controller', 'ProbeController', 'controllers/probe.controller.ts'),
        artifact('service', 'AlphaService', 'services/alpha.service.ts'),
        artifact('model', 'ProbeModel', 'models/probe.model.ts'),
      ],
    });

    expect(content).toBe(
      [
        ArtifactIndexEmitter.HEADER,
        "import { ProbeController } from '../controllers/probe.controller';",
        "import { AlphaService } from '../services/alpha.service';",
        "import { ZetaService } from '../services/zeta.service';",
        '',
        'export const GeneratedArtifacts = {',
        '  dataSources: [],',
        '  components: [],',
        '  repositories: [],',
        '  services: [AlphaService, ZetaService],',
        '  controllers: [ProbeController],',
        '};',
        '',
      ].join('\n'),
    );
  });

  test('import paths are POSIX, relative to the output file, without extension', () => {
    const content = ArtifactIndexEmitter.render({
      outFile: join(ROOT, 'application', 'generated.ts'),
      exportName: 'Index',
      artifacts: [artifact('service', 'DeepService', 'domain/a/b/deep.service.ts')],
    });

    expect(content).toContain("import { DeepService } from '../domain/a/b/deep.service';");
    expect(content).toContain('export const Index = {');
  });
});
