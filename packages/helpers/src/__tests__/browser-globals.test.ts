import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import vm from 'node:vm';
import { PACKAGE_ROOT } from './package-root';

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

describe('BaseHelper stays browser-pure', () => {
  const baseSource = join(PACKAGE_ROOT, 'src/modules/base.ts');

  test('its browser bundle imports nothing from node and reads process only through a guard', async () => {
    const text = await buildBrowserText({ entry: baseSource });

    expect(text).not.toMatch(/["']node:/);
    // The one allowed read is `globalThis.process?.env`; with every guarded read taken out, no `process` is left.
    const guardedRead = /globalThis\.process\?\./g;
    expect(text).toMatch(guardedRead);
    expect(text.replace(guardedRead, '')).not.toMatch(/\bprocess\b/);
    expect(() => vm.runInContext(text, createBrowserContext())).not.toThrow();
  });

  test('a helper logs to the console with no process, debug off unless a level turns it on', async () => {
    const factorySource = join(PACKAGE_ROOT, 'src/modules/logger/factory.ts');
    const text = await buildBrowserText({
      entry: 'probe.ts',
      files: {
        'probe.ts': [
          `import { BaseHelper } from ${JSON.stringify(baseSource)};`,
          `import { LoggerFactory } from ${JSON.stringify(factorySource)};`,
          `const helper = new BaseHelper({ scope: 'Page' });`,
          `helper.logger.debug('hidden');`,
          `helper.logger.info('shown');`,
          `LoggerFactory.use({ level: 'debug' });`,
          `helper.logger.for('run').debug('now shown');`,
        ].join('\n'),
      },
    });

    const lines: Array<string> = [];
    const record = (method: string) => (line: string) => lines.push(`${method}:${line}`);
    const context = createBrowserContext();
    context.console = {
      debug: record('debug'),
      log: record('log'),
      warn: record('warn'),
      error: record('error'),
    };

    vm.runInContext(text, context);

    expect(lines).toEqual(['log:[Page] shown', 'debug:[Page-run] now shown']);
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

describe('ECDH runs with no Buffer', () => {
  const ecdhSource = join(PACKAGE_ROOT, 'src/modules/crypto/algorithms/ecdh.algorithm.ts');

  test('a full exchange, encrypt and decrypt works in a scope without Buffer, process or Bun', async () => {
    const text = await buildBrowserText({
      entry: 'probe.ts',
      files: {
        'probe.ts': [
          `import { ECDH } from ${JSON.stringify(ecdhSource)};`,
          `const server = ECDH.withAlgorithm();`,
          `const client = ECDH.withAlgorithm();`,
          `const run = async () => {`,
          `  const serverPair = await server.generateKeyPair();`,
          `  const clientPair = await client.generateKeyPair();`,
          `  const clientPublic = await server.importPublicKey({ rawKeyB64: clientPair.publicKeyB64 });`,
          `  const serverPublic = await client.importPublicKey({ rawKeyB64: serverPair.publicKeyB64 });`,
          `  const serverSide = await server.deriveAESKey({ privateKey: serverPair.keyPair.privateKey, peerPublicKey: clientPublic });`,
          `  const clientSide = await client.deriveAESKey({ privateKey: clientPair.keyPair.privateKey, peerPublicKey: serverPublic, salt: serverSide.salt });`,
          `  const big = 'xin chào '.repeat(20000);`,
          `  const payload = await client.encrypt({ message: big, secret: clientSide.key, opts: { additionalData: 'ctx' } });`,
          `  const message = await server.decrypt({ message: payload, secret: serverSide.key, opts: { additionalData: 'ctx' } });`,
          `  return message === big && typeof Buffer === 'undefined' && typeof process === 'undefined';`,
          `};`,
          `report(run());`,
        ].join('\n'),
      },
    });

    expect(text).not.toMatch(/["']node:/);
    // `globalThis` inside this scope is the host's (the copy of Bun's own names carries it), so the probe hands its result
    // over through a plain function and checks `Buffer` and `process` by bare name, which the scope really lacks.
    const context = createBrowserContext();
    let pending: unknown;
    context.report = (value: unknown) => {
      pending = value;
    };
    vm.runInContext(text, context);
    const result = await pending;

    expect(result).toBe(true);
  });
});
