import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import type { IBffTransport } from '@/transport/common/types';

/**
 * The codemod table of this package (`devz codemod namespace-functions`) against the real exports:
 * the old name is still a function, the class has the method, and the old call and the new call
 * agree. The table is read from its source by path, not through a package import.
 */
const ROOT = resolve(import.meta.dir, '../../../..');
const MAPPING_FILE = join(
  ROOT,
  'packages/dev-configs/src/cli/codemod/namespace-functions/mappings/core-worker.ts',
);

interface IMapping {
  modules: string[];
  oldName: string;
  className: string;
  method: string;
  params: Array<{ key: string; optional?: boolean }>;
  restKey?: string;
  keepsOptions?: boolean;
}

const mappingModule = await import(MAPPING_FILE);
const { CORE_WORKER_MAPPINGS } = mappingModule as {
  CORE_WORKER_MAPPINGS: ReadonlyArray<IMapping>;
};

/** The src module behind each specifier of this package. */
const ENTRIES: Record<string, () => Promise<Record<string, unknown>>> = {
  '@venizia/ignis-worker': () => import('../index'),
};

const transport: IBffTransport = { fetch: async () => new Response('from-bff') };

/** A carrier, so the sample never touches the real `globalThis.fetch`. */
const makeCarrier = () => ({
  fetch: (async () => new Response('from-network')) as unknown as typeof globalThis.fetch,
});

/** A sample call of the old form, per old name: its positional arguments. */
const SAMPLES: Record<string, () => unknown[]> = {
  installBffFetch: () => [{ transport, basePath: '/api', carrier: makeCarrier() }],
};

const toOptions = (mapping: IMapping, args: unknown[]): unknown => {
  if (mapping.keepsOptions) {
    return args[0];
  }

  const options: Record<string, unknown> = {};
  mapping.params.forEach((parameter, index) => {
    if (index < args.length) {
      options[parameter.key] = args[index];
    }
  });
  return options;
};

describe('the core-worker mapping table', () => {
  test('it has entries, and every entry has a sample', () => {
    expect(CORE_WORKER_MAPPINGS.length).toBeGreaterThan(0);
    for (const mapping of CORE_WORKER_MAPPINGS) {
      expect(SAMPLES[mapping.oldName]).toBeDefined();
    }
  });

  for (const mapping of CORE_WORKER_MAPPINGS) {
    test(`${mapping.oldName} -> ${mapping.className}.${mapping.method}`, async () => {
      expect(mapping.modules.every((module) => module in ENTRIES)).toBe(true);

      const entry = await ENTRIES[mapping.modules[0]!]!();
      const classRef = entry[mapping.className] as Record<string, unknown> | undefined;

      expect(typeof entry[mapping.oldName]).toBe('function');
      expect(typeof classRef?.[mapping.method]).toBe('function');

      // Both install on their own carrier: each answers an uninstall function and routes /api alike.
      const oldArgs = SAMPLES[mapping.oldName]!();
      const newArgs = SAMPLES[mapping.oldName]!();
      const uninstallOld = Reflect.apply(
        entry[mapping.oldName] as () => unknown,
        undefined,
        oldArgs,
      ) as () => void;
      const uninstallNew = (classRef![mapping.method] as (opts: unknown) => () => void)(
        toOptions(mapping, newArgs),
      );

      expect(typeof uninstallOld).toBe('function');
      expect(typeof uninstallNew).toBe('function');

      const oldCarrier = (oldArgs[0] as { carrier: { fetch: typeof fetch } }).carrier;
      const newCarrier = (newArgs[0] as { carrier: { fetch: typeof fetch } }).carrier;
      const oldResponse = await oldCarrier.fetch('https://app.test/api/x');
      const newResponse = await newCarrier.fetch('https://app.test/api/x');
      const otherResponse = await newCarrier.fetch('https://app.test/other');
      const oldText = await oldResponse.text();
      const newText = await newResponse.text();
      const otherText = await otherResponse.text();

      expect(oldText).toBe('from-bff');
      expect(newText).toBe('from-bff');
      expect(otherText).toBe('from-network');

      uninstallOld();
      uninstallNew();
    });
  }
});
