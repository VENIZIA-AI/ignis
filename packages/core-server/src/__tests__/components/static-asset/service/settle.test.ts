import { AssetSettleService } from '@/components/static-asset/service';
import { BaseStorageHelper, type IObjectLocation } from '@venizia/ignis-helpers';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { describe, expect, test } from 'bun:test';
import { FakeStorageHelper } from '../fake-storage.helper';

// -----------------------------------------------------------------------------
// Settling keeps an upload that was written with a pending tag by replacing its tags. Every key is attempted, the
// first failure is thrown after that, and the tags are the application's.
// -----------------------------------------------------------------------------
interface ITagCall {
  bucket: string;
  key: string;
  tags: Record<string, string>;
}

class TaggingHelper extends FakeStorageHelper {
  readonly tagCalls: ITagCall[] = [];
  failOn = new Set<string>();

  override async replaceObjectTags(
    opts: IObjectLocation & { tags: Record<string, string> },
  ): Promise<void> {
    this.tagCalls.push({ bucket: opts.bucket.name, key: opts.object.key, tags: opts.tags });

    if (this.failOn.has(opts.object.key)) {
      throw new Error(`tagging failed for ${opts.object.key}`);
    }
  }
}

describe('settling uploads', () => {
  test('every key gets the configured tags in the configured bucket', async () => {
    const helper = new TaggingHelper();
    const service = AssetSettleService.build({ helper, bucket: 'bkt', tags: { temp: 'false' } });

    await service.settle({ keys: ['a/1.png', 'a/2.png'] });

    expect(helper.tagCalls).toEqual([
      { bucket: 'bkt', key: 'a/1.png', tags: { temp: 'false' } },
      { bucket: 'bkt', key: 'a/2.png', tags: { temp: 'false' } },
    ]);
  });

  test('tags of one call are merged over the configured ones, and the configured ones are not changed', async () => {
    const helper = new TaggingHelper();
    const service = AssetSettleService.build({
      helper,
      bucket: 'bkt',
      tags: { temp: 'false', source: 'import' },
    });

    await service.settle({ keys: ['a'], tags: { verified: 'true', source: 'checked' } });
    await service.settle({ keys: ['b'] });

    expect(helper.tagCalls[0]?.tags).toEqual({
      temp: 'false',
      source: 'checked',
      verified: 'true',
    });
    expect(helper.tagCalls[1]?.tags).toEqual({ temp: 'false', source: 'import' });
  });

  test('one failing key does not stop the others, and the failure is thrown once all were tried', async () => {
    const helper = new TaggingHelper();
    helper.failOn = new Set(['a/2.png']);
    const service = AssetSettleService.build({ helper, bucket: 'bkt', tags: { temp: 'false' } });

    const error = await RejectionHelper.rejectionOf({
      task: service.settle({ keys: ['a/1.png', 'a/2.png', 'a/3.png'] }),
    });

    expect(String(error)).toContain('tagging failed for a/2.png');
    expect(helper.tagCalls.map((call) => call.key)).toEqual(['a/1.png', 'a/2.png', 'a/3.png']);
  });

  test('with several failures the first one in order is the one thrown', async () => {
    const helper = new TaggingHelper();
    helper.failOn = new Set(['x', 'y']);
    const service = AssetSettleService.build({ helper, bucket: 'bkt', tags: {} });

    const error = await RejectionHelper.rejectionOf({
      task: service.settle({ keys: ['ok', 'y', 'x'] }),
    });

    expect(String(error)).toContain('tagging failed for y');
  });

  test('no keys settle nothing, and the bucket is read on each call', async () => {
    const helper = new TaggingHelper();
    let bucket = 'first';
    const service = AssetSettleService.build({
      helper,
      bucket: () => bucket,
      tags: { temp: 'false' },
    });

    await service.settle({ keys: [] });
    await service.settle({ keys: ['a'] });
    bucket = 'second';
    await service.settle({ keys: ['a'] });

    expect(helper.tagCalls.map((call) => call.bucket)).toEqual(['first', 'second']);
  });

  test('a storage that cannot tag fails loudly instead of leaving uploads pending', async () => {
    const service = AssetSettleService.build({
      helper: new FakeStorageHelper(),
      bucket: 'bkt',
      tags: { temp: 'false' },
    });

    const result = await RejectionHelper.rejectionOf({ task: service.settle({ keys: ['a'] }) });
    expect(result).toBeInstanceOf(Error);
    expect(BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH).toBeGreaterThan(0);
  });
});
