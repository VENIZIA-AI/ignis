import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import vm from 'node:vm';

/**
 * The browser entries must run where Node's globals do not exist - a Worker, a page. A bundle that
 * reads `global` or `process` unguarded forces every consumer to polyfill it, so each entry is
 * bundled for the browser and run in a context with those globals taken away.
 */
const NODE_ONLY_GLOBALS = new Set([
  'global',
  'process',
  'Buffer',
  'require',
  'module',
  'Bun',
  'setImmediate',
  'clearImmediate',
]);

const buildBrowserText = async (opts: { entry: string; files?: Record<string, string> }) => {
  const built = await Bun.build({
    entrypoints: [opts.entry],
    files: opts.files,
    target: 'browser',
    format: 'iife',
  });

  if (!built.success) {
    throw new Error(`[browser-globals] Bundle failed | ${built.logs.map(String).join(' | ')}`);
  }

  return built.outputs[0].text();
};

/** Web globals kept, Node's removed. */
const createBrowserContext = () => {
  const sandbox: Record<string, unknown> = {};
  for (const name of Object.getOwnPropertyNames(globalThis)) {
    if (!NODE_ONLY_GLOBALS.has(name)) {
      sandbox[name] = Reflect.get(globalThis, name);
    }
  }

  return vm.createContext(sandbox);
};

describe('the harness sees a Node global', () => {
  test('a bundle that reads `global` fails to run', async () => {
    const text = await buildBrowserText({
      entry: 'probe.ts',
      files: { 'probe.ts': 'export const root = global;\nconsole.log(root);' },
    });

    expect(() => vm.runInContext(text, createBrowserContext())).toThrow(/global/);
  });
});

describe('the browser entries run with no Node global', () => {
  const entries = ['src/core.ts', 'src/common/index.ts', 'src/uuid.ts', 'src/temporal.ts'];

  for (const entry of entries) {
    test(`${entry} evaluates in a Worker-like scope, with no lodash in it`, async () => {
      const text = await buildBrowserText({ entry: join(process.cwd(), entry) });

      expect(text.includes('lodash')).toBe(false);
      expect(() => vm.runInContext(text, createBrowserContext())).not.toThrow();
    });
  }
});
