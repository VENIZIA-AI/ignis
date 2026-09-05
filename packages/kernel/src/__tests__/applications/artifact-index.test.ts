import { ArtifactIndexHelper } from '@/base/applications/artifact-index';
import { ArtifactIndexFields } from '@/base/applications/common';
import { service } from '@/base/metadata';
import { describe, expect, test } from 'bun:test';

const helper = ArtifactIndexHelper.getInstance();

class Plain {}
class AlsoPlain {}

describe('ArtifactIndexHelper.flatten', () => {
  test('one index stays one; arrays nested to any depth flatten in input order', () => {
    const first = { services: [Plain] };
    const second = { services: [AlsoPlain] };
    const third = { controllers: [Plain] };

    expect(helper.flatten({ input: first })).toEqual([first]);
    expect(helper.flatten({ input: [first, [second, [third]]] })).toEqual([first, second, third]);
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
