import './kernel-stub';
import { IgnisArtifactsPlugin } from '@/bun';
import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const APP = resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'auto', 'app');

describe('IgnisArtifactsPlugin', () => {
  test('render emits every decorated class with absolute import paths', () => {
    const content = IgnisArtifactsPlugin.render({ root: resolve(APP, 'src') });
    expect(content).toContain(`from '${resolve(APP, 'src', 'services', 'alpha.service')}'`);
    expect(content).toContain('BetaRepository');
    expect(content).not.toMatch(/from '\.\.?\//);
  });

  test('defaultRoot is the src beside the nearest package.json above the working directory', () => {
    expect(IgnisArtifactsPlugin.defaultRoot({ from: resolve(APP, 'src', 'services') })).toBe(
      resolve(APP, 'src'),
    );
  });

  test('at run time the virtual module serves the index', async () => {
    await IgnisArtifactsPlugin.registerRuntime({ root: resolve(APP, 'src') });
    const specifier = IgnisArtifactsPlugin.VIRTUAL;
    const { GeneratedArtifacts } = await import(specifier);
    expect(GeneratedArtifacts.services.map((target: { name: string }) => target.name)).toEqual([
      'AlphaService',
    ]);
    expect(GeneratedArtifacts.repositories.map((target: { name: string }) => target.name)).toEqual([
      'BetaRepository',
    ]);
  });

  test('registerRuntime is idempotent', async () => {
    await IgnisArtifactsPlugin.registerRuntime({ root: resolve(APP, 'src') });
    await IgnisArtifactsPlugin.registerRuntime({ root: resolve(APP, 'src') });
    const { GeneratedArtifacts } = await import(IgnisArtifactsPlugin.VIRTUAL);
    expect(GeneratedArtifacts.services).toHaveLength(1);
  });
});
