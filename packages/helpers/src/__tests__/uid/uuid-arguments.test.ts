import { afterEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import { createUuidV4, createUuidV7, UuidHelper, uuidV4, uuidV7 } from '@/modules/uid';
import { PACKAGE_ROOT } from '../package-root';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const timestampOf = (opts: { id: string }): number =>
  Number.parseInt(opts.id.slice(0, 8) + opts.id.slice(9, 13), 16);

// What a generator receives when it is passed point-free: `Array.from` hands (undefined, index),
// `map` hands (value, index, array), hono's `requestId({ generator })` hands the context.
const STRAY_ARGUMENTS: Array<Array<unknown>> = [
  [undefined, 0],
  [undefined, 2],
  ['hex', 0, ['hex']],
  ['buffer', 0, ['buffer']],
  ['a', 0, ['a']],
  [{}],
  [{ req: {}, header: () => undefined }],
];

const callWith = (opts: {
  generator: (...args: Array<unknown>) => unknown;
  args: Array<unknown>;
}) => opts.generator(...opts.args);

const v7Generators = [
  { name: 'uuidV7', generator: uuidV7 },
  { name: 'createUuidV7()', generator: createUuidV7() },
  { name: 'UuidHelper.v7', generator: UuidHelper.getInstance().v7 },
];

const v4Generators = [
  { name: 'uuidV4', generator: uuidV4 },
  { name: 'createUuidV4()', generator: createUuidV4() },
  { name: 'UuidHelper.v4', generator: UuidHelper.getInstance().v4 },
];

describe('a v7 generator ignores whatever it is called with', () => {
  for (const { name, generator } of v7Generators) {
    test(`${name} - still a current v7 string`, () => {
      const before = Date.now();
      const ids = STRAY_ARGUMENTS.map(args => callWith({ generator, args }));
      const after = Date.now();

      for (const id of ids) {
        expect(typeof id).toBe('string');
        expect(id).toMatch(UUID_V7);
        // An argument reaching `Bun.randomUUIDv7(encoding, timestamp)` stamps the id with 1970.
        expect(timestampOf({ id: String(id) })).toBeGreaterThanOrEqual(before);
        expect(timestampOf({ id: String(id) })).toBeLessThanOrEqual(after + 50);
      }
    });
  }

  test('Array.from and map, the two point-free shapes callers actually write', () => {
    const fromArray = Array.from({ length: 3 }, uuidV7);
    const mapped = ['a', 'b'].map(uuidV7);

    expect([...fromArray, ...mapped].every(id => UUID_V7.test(id))).toBe(true);
  });
});

const V7_SOURCE = path.resolve(PACKAGE_ROOT, 'src/modules/uid/uuid/v7.ts');

describe('an older helpers version already holding the v7 slot', () => {
  // A fresh process: the slot is read once, at the module's first evaluation.
  test('its generator is still called with no argument', () => {
    const script = `
      Reflect.set(globalThis, Symbol.for('@venizia/ignis-helpers:uuid-v7'), Bun.randomUUIDv7);
      const { uuidV7 } = await import('${V7_SOURCE}');
      const ids = Array.from({ length: 3 }, uuidV7);
      const stamps = ids.map(id => Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16));
      console.log(JSON.stringify({ ids, current: stamps.every(stamp => Math.abs(stamp - Date.now()) < 60_000) }));
    `;
    const run = Bun.spawnSync({ cmd: [process.execPath, '-e', script], stderr: 'pipe' });
    const report: { ids: Array<string>; current: boolean } = JSON.parse(run.stdout.toString());

    expect(report.ids.every(id => UUID_V7.test(id))).toBe(true);
    expect(report.current).toBe(true);
  });
});

const HELPER_SOURCE = path.resolve(PACKAGE_ROOT, 'src/modules/uid/uuid/helper.ts');

describe('an older helpers version already holding a UuidHelper instance', () => {
  // 0.2.0-39 kept the facade instance in a realm-wide slot, with `v7` bound to the raw
  // `Bun.randomUUIDv7`: sharing it would hand that generator back to every newer caller.
  test('getInstance answers this module copy, whose v7 forwards no argument', () => {
    const script = `
      Reflect.set(globalThis, Symbol.for('@venizia/ignis-helpers:uuid-helper'), { v7: Bun.randomUUIDv7, stale: true });
      const { UuidHelper } = await import('${HELPER_SOURCE}');
      const helper = UuidHelper.getInstance();
      const ids = Array.from({ length: 2 }, helper.v7);
      const stamps = ids.map(id => Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16));
      console.log(JSON.stringify({ fresh: helper instanceof UuidHelper, current: stamps.every(stamp => Math.abs(stamp - Date.now()) < 60_000) }));
    `;
    const run = Bun.spawnSync({ cmd: [process.execPath, '-e', script], stderr: 'pipe' });
    const report: { fresh: boolean; current: boolean } = JSON.parse(
      run.stdout.toString().trim().split('\n').at(-1) ?? '{}',
    );

    expect(report.fresh).toBe(true);
    expect(report.current).toBe(true);
  });
});

describe('a v4 generator ignores whatever it is called with', () => {
  for (const { name, generator } of v4Generators) {
    test(`${name} - still a v4 string`, () => {
      const ids = STRAY_ARGUMENTS.map(args => callWith({ generator, args }));

      for (const id of ids) {
        expect(typeof id).toBe('string');
        expect(id).toMatch(UUID_V4);
      }
    });
  }
});

describe('the native v4 path never forwards an argument', () => {
  // Node's `crypto.randomUUID(options)` validates its argument, so `['a'].map(uuidV4)` threw there.
  // Bun ignores it, which is why this is simulated rather than observed.
  const prototypeRandomUuid = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(crypto),
    'randomUUID',
  );

  afterEach(() => {
    Reflect.deleteProperty(crypto, 'randomUUID');
  });

  test('a strict randomUUID that throws on any argument is never handed one', () => {
    const received: Array<number> = [];
    const strict = (...args: Array<unknown>): string => {
      received.push(args.length);
      if (args.length > 0) {
        throw new TypeError('The "options" argument must be of type object');
      }
      return '00000000-0000-4000-8000-000000000000';
    };
    Object.defineProperty(crypto, 'randomUUID', { value: strict, configurable: true });

    const generate = createUuidV4();
    const ids = STRAY_ARGUMENTS.map(args => callWith({ generator: generate, args }));

    expect(prototypeRandomUuid).toBeDefined();
    expect(received.length).toBe(STRAY_ARGUMENTS.length);
    expect(received.every(count => count === 0)).toBe(true);
    expect(ids.every(id => id === '00000000-0000-4000-8000-000000000000')).toBe(true);
  });
});
