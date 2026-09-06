import { ArtifactIndexHelper } from '@/base/applications/artifact-index';
import { ArtifactIndexFields } from '@/base/applications/common';
import type { TArtifactIndexInput } from '@/base/applications/common';
import { service } from '@/base/metadata';
import { describe, expect, test } from 'bun:test';

const helper = ArtifactIndexHelper.getInstance();

class Plain {}
class AlsoPlain {}

describe('ArtifactIndexHelper.flatten', () => {
  const application = { runMode: 'worker' };

  test('one index stays one; arrays nested to any depth flatten in input order', async () => {
    const first = { services: [Plain] };
    const second = { services: [AlsoPlain] };
    const third = { controllers: [Plain] };

    expect(await helper.flatten({ input: first, application })).toEqual([first]);
    expect(await helper.flatten({ input: [first, [second, [third]]], application })).toEqual([
      first,
      second,
      third,
    ]);
  });

  test('a conditional entry contributes its subtree when its when answers true and nothing when false', async () => {
    const controllers = { controllers: [Plain] };
    const services = { services: [AlsoPlain] };

    const kept = await helper.flatten({
      input: [{ when: () => true, index: controllers }, services],
      application,
    });
    expect(kept).toEqual([controllers, services]);

    const dropped = await helper.flatten({
      input: [{ when: () => false, index: [controllers, [controllers]] }, services],
      application,
    });
    expect(dropped).toEqual([services]);
  });

  test('a consumer filter that destructures kinds from a non-array input still compiles and runs', async () => {
    const dropControllers = (input: TArtifactIndexInput): TArtifactIndexInput => {
      if (Array.isArray(input)) {
        return input.map(dropControllers);
      }
      const { controllers, ...rest } = input;
      return controllers ? rest : input;
    };

    const filtered = dropControllers([
      { controllers: [Plain], services: [AlsoPlain] },
      { when: () => true, index: { services: [Plain] } },
    ]);
    const resolved = await helper.resolve({ input: filtered, application });

    expect(resolved.controllers).toEqual([]);
    expect(resolved.services).toEqual([AlsoPlain, Plain]);
  });

  test('when receives the application and may be async; the gate reads run mode from it', async () => {
    const controllers = { controllers: [Plain] };
    const seen: unknown[] = [];
    const gate = async (opts: { application: unknown }) => {
      seen.push(opts.application);
      return Reflect.get(Object(opts.application), 'runMode') !== 'worker';
    };

    const resolved = await helper.resolve({
      input: [{ when: gate, index: controllers }, { services: [AlsoPlain] }],
      application,
    });

    expect(seen).toEqual([application]);
    expect(resolved.controllers).toEqual([]);
    expect(resolved.services).toEqual([AlsoPlain]);
  });
});

describe('ArtifactIndexHelper.select', () => {
  test('collects one kind across every index and leaves the other kinds alone', async () => {
    const selected = await helper.select({
      indexes: [{ services: [Plain], controllers: [AlsoPlain] }, { services: [AlsoPlain] }],
      field: ArtifactIndexFields.SERVICES,
      application: {},
    });

    expect(selected).toEqual([Plain, AlsoPlain]);
  });

  test('when: false drops the class; when reads the application and may be async', async () => {
    @service<{ runMode: string }>({ when: ({ application }) => application.runMode !== 'migrate' })
    class OnlyOutsideMigrate {}
    @service<{ runMode: string }>({
      when: async ({ application }) => application.runMode === 'migrate',
    })
    class OnlyInMigrate {}

    const selected = await helper.select({
      indexes: [{ services: [OnlyOutsideMigrate, OnlyInMigrate, Plain] }],
      field: ArtifactIndexFields.SERVICES,
      application: { runMode: 'migrate' },
    });

    expect(selected).toEqual([OnlyInMigrate, Plain]);
  });

  test('order sorts within the kind; ties keep index order', async () => {
    @service({ order: -1 })
    class First {}
    @service({ order: 10 })
    class Last {}

    const selected = await helper.select({
      indexes: [{ services: [Last, Plain, AlsoPlain, First] }],
      field: ArtifactIndexFields.SERVICES,
      application: {},
    });

    expect(selected).toEqual([First, Plain, AlsoPlain, Last]);
  });

  test('the when conditions run concurrently: a condition that waits for a later one still resolves', async () => {
    let releaseFirst: (decision: boolean) => void = () => {};
    const firstDecision = new Promise<boolean>(resolve => {
      releaseFirst = resolve;
    });

    @service({ when: () => firstDecision })
    class WaitsForTheSecond {}
    @service({
      when: () => {
        releaseFirst(true);
        return true;
      },
    })
    class ReleasesTheFirst {}

    const selected = await helper.select({
      indexes: [{ services: [WaitsForTheSecond, ReleasesTheFirst] }],
      field: ArtifactIndexFields.SERVICES,
      application: {},
    });

    expect(selected).toEqual([WaitsForTheSecond, ReleasesTheFirst]);
  });
});
