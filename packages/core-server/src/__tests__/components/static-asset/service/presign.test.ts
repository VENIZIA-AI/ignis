import {
  AssetCommitToken,
  AssetTokenCodecs,
  StaticAssetErrors,
} from '@/components/static-asset/common';
import { AssetPresignService, type IAssetPresignFile } from '@/components/static-asset/service';
import { isApplicationError, RequestBodyErrors } from '@venizia/ignis-helpers/core';
import { RecordUtility } from '@venizia/ignis-helpers';
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { describe, expect, test } from 'bun:test';

// -----------------------------------------------------------------------------
// Presigned uploads: what the client announces is checked, the key is the server's, the URL pins the size, the type and
// the tags, and the token names the object. A real BunS3Helper signs (no network is used); the application decides the
// folder, the payload and the extensions, so this suite plays an application with tenants and two file families.
// -----------------------------------------------------------------------------
interface IPayload {
  key: string;
  name: string;
  size: number;
  mime: string;
  extension: string;
  ts: number;
  ownerId?: string;
  resource?: string;
  expiresAt: number;
}

interface IContext {
  organizerId?: string;
  merchantId?: string;
  resource?: string;
}

const NOW = 1_700_000_000_000;
const MAX_BYTES = 10 * 1024 * 1024;
const UUID = '[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}';

const isPayload = (value: unknown): value is IPayload =>
  RecordUtility.isPlainRecord(value) &&
  typeof value.key === 'string' &&
  typeof value.expiresAt === 'number';

const token = new AssetCommitToken<IPayload>({
  secretKey: 'test-secret-not-real',
  codec: AssetTokenCodecs.signedJson<IPayload>({ isPayload }),
  expiresAtOf: ({ payload }) => payload.expiresAt,
  ownerOf: ({ payload }) => payload.ownerId,
  now: () => NOW,
});

const helper = new BunS3Helper({
  accessKey: 'AK',
  secretKey: 'SK',
  endpoint: { default: 'http://internal:9000', public: 'https://files.example.com' },
  region: 'us-east-1',
});

const tenantPath = (opts: { context: IContext; extension: string }) => {
  const { context, extension } = opts;
  const tenant = context.merchantId
    ? `organizers/${context.organizerId}/merchants/${context.merchantId}`
    : context.organizerId
      ? `organizers/${context.organizerId}`
      : 'bo';

  return `${tenant}/${extension === '.xlsx' ? 'xlsx' : 'image'}`;
};

const build = (
  over: Partial<Parameters<typeof AssetPresignService.build<IPayload, IContext>>[0]> = {},
) =>
  AssetPresignService.build<IPayload, IContext>({
    helper,
    bucket: 'bkt',
    token,
    allowedExtensions: ['.png', '.jpg', '.xlsx'],
    maxBytes: MAX_BYTES,
    maxFolderDepth: 5,
    resolvePath: ({ context, extension }) => tenantPath({ context, extension }),
    buildPayload: ({ key, name, file, extension, issuedAt, ownerId, context }) => ({
      key,
      name,
      size: file.size,
      mime: file.contentType,
      extension,
      ts: issuedAt,
      ownerId,
      resource: context.resource,
      expiresAt: issuedAt + 60_000,
    }),
    tagging: { temp: 'true' },
    signedContentType: 'application/octet-stream',
    expiresIn: { unit: 'second', value: 600 },
    now: () => NOW,
    ...over,
  });

const file = (over: Partial<IAssetPresignFile> = {}): IAssetPresignFile => ({
  fileName: 'photo.png',
  contentType: 'image/png',
  size: 1234,
  ...over,
});

const codeOf = async (task: Promise<unknown>): Promise<string | undefined> => {
  const error = await RejectionHelper.rejectionOf({ task });
  const normalized = RecordUtility.isRecord(error) ? error.normalized : undefined;

  return RecordUtility.isRecord(normalized) && typeof normalized.code === 'string'
    ? normalized.code
    : undefined;
};

const CODES = {
  extension: StaticAssetErrors.PRESIGN_EXTENSION_NOT_ALLOWED.message.code,
  size: StaticAssetErrors.PRESIGN_FILE_SIZE_INVALID.message.code,
  large: StaticAssetErrors.UPLOAD_TOO_LARGE.message.code,
  many: RequestBodyErrors.TOO_MANY_FILES.message.code,
};

describe('what is prepared', () => {
  test('one signed URL and one token per file, and the key is the folder of the application and a name the server chose', async () => {
    const [result] = await build().presign({
      files: [file({ fileName: 'My Holiday Photo.PNG' })],
      context: { organizerId: 'o1', merchantId: 'm1' },
      ownerId: 'u1',
    });

    expect(result?.key).toMatch(new RegExp(`^organizers/o1/merchants/m1/image/${UUID}\\.png$`));
    expect(result?.key).not.toContain('Holiday');
    expect(result?.preSignUrl).toContain(`https://files.example.com/bkt/${result?.key}?`);
  });

  test('the URL pins the size, the content type and the tags, so the holder cannot change them', async () => {
    const [result] = await build().presign({ files: [file()], context: {}, ownerId: 'u1' });
    const url = new URL(result?.preSignUrl ?? '');

    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-length;content-type;host;x-amz-tagging',
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
  });

  test("the content type that is signed is the application's when it names one, and the announced one when it does not", async () => {
    const seen: Array<string | undefined> = [];
    const spy = Object.create(helper, {
      presignPut: {
        value: (...args: Parameters<BunS3Helper['presignPut']>) => {
          seen.push(args[0].contentType);

          return helper.presignPut(...args);
        },
      },
    });

    await build({ helper: spy }).presign({
      files: [file({ contentType: 'text/html' })],
      context: {},
    });
    await build({ helper: spy, signedContentType: undefined }).presign({
      files: [file({ contentType: 'image/png' })],
      context: {},
    });

    expect(seen).toEqual(['application/octet-stream', 'image/png']);
  });

  test('the token names the object and the owner the URL was issued for, and the service that reads it agrees', async () => {
    const [result] = await build().presign({
      files: [file({ size: 99 })],
      context: { organizerId: 'o1', resource: 'product' },
      ownerId: 'u1',
    });
    const payload = token.verify({ token: result?.fileKeyToken ?? '', ownerId: 'u1' });

    expect(payload).toMatchObject({
      key: result?.key,
      size: 99,
      mime: 'image/png',
      extension: '.png',
      ts: NOW,
      ownerId: 'u1',
      resource: 'product',
    });
    expect(() => token.verify({ token: result?.fileKeyToken ?? '', ownerId: 'u2' })).toThrow();
  });

  test('several files give several results in order, each with its own name', async () => {
    const results = await build().presign({
      files: [
        file({ fileName: 'a.png' }),
        file({ fileName: 'b.xlsx', contentType: 'application/octet-stream' }),
      ],
      context: { organizerId: 'o1' },
    });

    expect(results.map((item) => item.key.split('/').slice(0, -1).join('/'))).toEqual([
      'organizers/o1/image',
      'organizers/o1/xlsx',
    ]);
    expect(new Set(results.map((item) => item.key)).size).toBe(2);
  });

  test("the folder is the application's: it sees the context and the extension, and the default is the root", async () => {
    const seen: Array<{ extension: string; context: IContext }> = [];
    const service = build({
      resolvePath: ({ extension, context }) => {
        seen.push({ extension, context });

        return '/deep/er/';
      },
    });
    const [result] = await service.presign({ files: [file()], context: { merchantId: 'm9' } });
    const [root] = await build({ resolvePath: undefined }).presign({
      files: [file()],
      context: {},
    });

    expect(seen).toEqual([{ extension: '.png', context: { merchantId: 'm9' } }]);
    expect(result?.key).toMatch(new RegExp(`^deep/er/${UUID}\\.png$`));
    expect(root?.key).toMatch(new RegExp(`^${UUID}\\.png$`));
  });

  test("the name is the application's to choose, and a name with a slash is refused", async () => {
    const [named] = await build({ resolveName: ({ extension }) => `fixed${extension}` }).presign({
      files: [file()],
      context: {},
    });
    const slashed = build({ resolveName: () => 'a/b.png' }).presign({
      files: [file()],
      context: {},
    });

    expect(named?.key).toBe('organizers/bo/image/fixed.png'.replace('organizers/', ''));
    const result2 = await codeOf(slashed);
    expect(result2).toBe(StaticAssetErrors.OBJECT_NAME_INVALID.message.code);
  });

  test('a folder that climbs or runs too deep is refused, and nothing is signed', async () => {
    for (const folder of ['../x', 'a/../b', 'a/b/c/d/e/f/g']) {
      const task = build({ resolvePath: () => folder }).presign({ files: [file()], context: {} });

      const result3 = await codeOf(task);
      expect(result3).toBe(StaticAssetErrors.OBJECT_NAME_INVALID.message.code);
    }
  });

  test('the URL is rewritten after it is signed, e.g. to go through a proxy', async () => {
    const [result] = await build({
      rewriteUrl: ({ url }) =>
        url.replace('https://files.example.com', 'https://api.example.com/assets/proxy'),
    }).presign({ files: [file()], context: {} });

    expect(result?.preSignUrl.startsWith('https://api.example.com/assets/proxy/bkt/')).toBe(true);
  });

  test('the bucket is read on each call, so it can come from the environment', async () => {
    let bucket = 'first';
    const service = build({ bucket: () => bucket });
    const [one] = await service.presign({ files: [file()], context: {} });
    bucket = 'second';
    const [two] = await service.presign({ files: [file()], context: {} });

    expect(one?.preSignUrl).toContain('/first/');
    expect(two?.preSignUrl).toContain('/second/');
  });
});

describe('what is refused', () => {
  test('an extension that is not allowed, in any case, with a second extension or with none', async () => {
    for (const fileName of ['a.exe', 'a.html', 'a.png.php', 'a', '.png.', 'a.PDF', 'a.svg']) {
      const result = await codeOf(build().presign({ files: [file({ fileName })], context: {} }));
      expect(result).toBe(CODES.extension);
    }

    for (const fileName of ['A.PNG', 'b.JpG', 'c.XLSX']) {
      const result2 = await build().presign({ files: [file({ fileName })], context: {} });
      expect(result2.length).toBe(1);
    }
  });

  test('a size that is not a positive whole number, and one over the limit by a byte', async () => {
    for (const size of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result3 = await codeOf(build().presign({ files: [file({ size })], context: {} }));
      expect(result3).toBe(CODES.size);
    }

    const result4 = await codeOf(
      build().presign({ files: [file({ size: MAX_BYTES + 1 })], context: {} }),
    );
    expect(result4).toBe(CODES.large);
    const result5 = await build().presign({ files: [file({ size: MAX_BYTES })], context: {} });
    expect(result5.length).toBe(1);
  });

  test('no file, and more files than the limit', async () => {
    const service = build({ maxFiles: 2 });

    const result6 = await codeOf(service.presign({ files: [], context: {} }));
    expect(result6).toBe(CODES.many);
    const result7 = await codeOf(service.presign({ files: [file(), file(), file()], context: {} }));
    expect(result7).toBe(CODES.many);
    const result8 = await service.presign({ files: [file(), file()], context: {} });
    expect(result8.length).toBe(2);
  });

  test('one bad file refuses the whole call before anything is signed', async () => {
    let signed = 0;
    const counting = Object.create(helper, {
      presignPut: {
        value: (...args: Parameters<BunS3Helper['presignPut']>) => {
          signed += 1;

          return helper.presignPut(...args);
        },
      },
    });
    const service = build({ helper: counting });

    const result9 = await codeOf(
      service.presign({ files: [file(), file({ fileName: 'a.exe' })], context: {} }),
    );
    expect(result9).toBe(CODES.extension);
    expect(signed).toBe(0);
  });

  test("the definitions are the application's to name, and the size texts can use megabytes", async () => {
    const mine = {
      message: { text: 'max %{maxMegabytes} MB', code: 'app.too_large' },
      statusCode: 413,
    };
    const service = build({ errors: { FILE_TOO_LARGE: mine } });
    const error = await RejectionHelper.rejectionOf({
      task: service.presign({ files: [file({ size: MAX_BYTES + 1 })], context: {} }),
    });

    expect(error).toMatchObject({ statusCode: 413 });
    expect(isApplicationError(error) ? error.toFilledText() : '').toBe('max 10 MB');
  });
});
