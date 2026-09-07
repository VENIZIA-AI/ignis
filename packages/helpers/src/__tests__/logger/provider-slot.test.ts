import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Each case runs in a fresh process: the factory is module state, and the slot is process-global. */
const runInFreshProcess = async (opts: { name: string; body: string }): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ignis-logger-slot-'));
  try {
    const script = path.join(directory, `${opts.name}.ts`);
    const factoryPath = path.resolve(process.cwd(), 'src/modules/logger/factory.ts');
    await writeFile(
      script,
      `const SLOT = Symbol.for('ignis:logger-provider');\n` +
        `const fakeLogger = { debug() {}, info() {}, warn() {}, error() {}, emerg() {}, log() {}, for() { return fakeLogger; } };\n` +
        `const fakeProvider = { name: 'fake', get: () => fakeLogger };\n` +
        opts.body.replace('__FACTORY__', JSON.stringify(factoryPath)),
    );
    const result = Bun.spawnSync({
      cmd: ['bun', script],
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const line = result.stdout
      .toString()
      .split('\n')
      .find(text => text.startsWith('RESULT:'));
    if (!line) {
      throw new Error(`[provider-slot] no result | stderr: ${result.stderr.toString()}`);
    }
    return line.slice('RESULT:'.length);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

describe('LoggerFactory shares its provider across module copies', () => {
  test('a provider registered by another copy (the slot) is the current provider here', async () => {
    const result = await runInFreshProcess({
      name: 'reads-slot',
      body:
        `Reflect.set(globalThis, SLOT, fakeProvider);\n` +
        `const { LoggerFactory } = await import(__FACTORY__);\n` +
        `console.log('RESULT:' + String(LoggerFactory.currentProvider() === fakeProvider));\n`,
    });

    expect(result).toBe('true');
  });

  test('use() publishes the provider to the slot for the other copy', async () => {
    const result = await runInFreshProcess({
      name: 'writes-slot',
      body:
        `const { LoggerFactory } = await import(__FACTORY__);\n` +
        `LoggerFactory.use({ provider: fakeProvider });\n` +
        `console.log('RESULT:' + String(Reflect.get(globalThis, SLOT) === fakeProvider));\n`,
    });

    expect(result).toBe('true');
  });
});
