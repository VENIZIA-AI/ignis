/** Storage Path Validation Test Suite */

import { describe, test, expect } from 'bun:test';
import { BaseStorageHelper } from '@/modules/storage/base';
import {
  type IBucketInfo,
  type IBucketRef,
  type IFileStat,
  type IListObjectsOptions,
  type IObjectInfo,
  type IObjectLocation,
  type IObjectRef,
  type IUploadFile,
} from '@/modules';
import { type Readable } from 'node:stream';

// Concrete subclass to test abstract base methods
class TestHelper extends BaseStorageHelper {
  override hasBucket(_opts: { bucket: IBucketRef }): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  override getBuckets(): Promise<IBucketInfo[]> {
    throw new Error('Method not implemented.');
  }

  override getBucket(_opts: { bucket: IBucketRef }): Promise<IBucketInfo | null> {
    throw new Error('Method not implemented.');
  }

  override createBucket(_opts: { bucket: IBucketRef }): Promise<IBucketInfo | null> {
    throw new Error('Method not implemented.');
  }

  override removeBucket(_opts: { bucket: IBucketRef }): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  protected override get defaultLinkPrefix(): string {
    return '/test-assets/';
  }

  protected override writeObject(_opts: IObjectLocation & { file: IUploadFile }): Promise<void> {
    throw new Error('Method not implemented.');
  }

  override getObject(_opts: IObjectLocation & { options?: any }): Promise<Readable> {
    throw new Error('Method not implemented.');
  }

  override getStat(_opts: IObjectLocation): Promise<IFileStat> {
    throw new Error('Method not implemented.');
  }

  override removeObject(_opts: IObjectLocation): Promise<void> {
    throw new Error('Method not implemented.');
  }

  override removeObjects(_opts: { bucket: IBucketRef; objects: IObjectRef[] }): Promise<void> {
    throw new Error('Method not implemented.');
  }

  override listObjects(_opts: IListObjectsOptions): Promise<IObjectInfo[]> {
    throw new Error('Method not implemented.');
  }
}

const helper = new TestHelper({
  identifier: 'test-helper',
  scope: 'test',
});

describe('Storage Path Validation', () => {
  describe('isValidName (baseline)', () => {
    test('should accept simple filenames', () => {
      expect(helper.isValidSegment({ segment: 'file.jpg' })).toBe(true);
      expect(helper.isValidSegment({ segment: 'my-photo.png' })).toBe(true);
      expect(helper.isValidSegment({ segment: 'document_v2.pdf' })).toBe(true);
    });

    test('should reject names with slashes', () => {
      expect(helper.isValidSegment({ segment: 'folder/file.jpg' })).toBe(false);
      expect(helper.isValidSegment({ segment: 'a/b/c' })).toBe(false);
    });

    test('should reject names with path traversal', () => {
      expect(helper.isValidSegment({ segment: '..' })).toBe(false);
      expect(helper.isValidSegment({ segment: '../file.jpg' })).toBe(false);
    });

    test('should reject empty or whitespace names', () => {
      expect(helper.isValidSegment({ segment: '' })).toBe(false);
      expect(helper.isValidSegment({ segment: '   ' })).toBe(false);
    });

    test('should reject names with shell special chars', () => {
      expect(helper.isValidSegment({ segment: 'file;rm -rf' })).toBe(false);
      expect(helper.isValidSegment({ segment: 'file|cat' })).toBe(false);
      expect(helper.isValidSegment({ segment: 'file`id`' })).toBe(false);
    });
  });

  describe('control and bidirectional characters', () => {
    test.each([
      ['a tab', 'a\tb.png'],
      ['a delete character', 'a\u007fb.png'],
      ['a next-line character', 'a\u0085b.png'],
      ['a lone surrogate', 'a\ud800b.png'],
      ['a right-to-left override', 'photo\u202Egpj.exe'],
      ['a left-to-right override', 'a\u202Db.png'],
      ['an embedding mark', 'a\u202Ab.png'],
      ['an isolate', 'a\u2066b.png'],
      ['a directional mark', 'a\u200Fb.png'],
      ['an arabic letter mark', 'a\u061Cb.png'],
      ['a line separator', 'a\u2028b.png'],
      ['a paragraph separator', 'a\u2029b.png'],
    ])('%s is refused in a segment, a key and a bucket name', (_name, value) => {
      expect(helper.isValidSegment({ segment: value })).toBe(false);
      expect(helper.isValidObjectKey({ object: { key: `folder/${value}` } })).toBe(false);
      expect(helper.isValidBucketName({ bucket: { name: value } })).toBe(false);
    });

    test('ordinary non-ASCII names stay valid', () => {
      expect(helper.isValidSegment({ segment: 'ảnh đẹp.png' })).toBe(true);
      expect(helper.isValidSegment({ segment: 'файл.txt' })).toBe(true);
      expect(helper.isValidSegment({ segment: '写真.jpg' })).toBe(true);
    });
  });

  describe('segment length in UTF-8 bytes', () => {
    const accepted = [
      ['255 ASCII bytes', 'a'.repeat(255)],
      ['127 two-byte characters and one ASCII byte', `${'é'.repeat(127)}a`],
      ['85 three-byte characters', '写'.repeat(85)],
      ['63 emoji and 3 ASCII bytes', `${'😀'.repeat(63)}abc`],
    ];
    const refused = [
      ['128 two-byte characters', 'é'.repeat(128)],
      ['86 three-byte characters', '写'.repeat(86)],
      ['64 emoji', '😀'.repeat(64)],
    ];

    test.each(accepted)('%s is a valid segment, key and bucket name', (_name, value) => {
      expect(helper.isValidSegment({ segment: value })).toBe(true);
      expect(helper.isValidObjectKey({ object: { key: `folder/${value}` } })).toBe(true);
      expect(helper.isValidBucketName({ bucket: { name: value } })).toBe(true);
    });

    test.each(refused)(
      '%s, inside 255 characters, is refused in a segment, a key and a bucket name',
      (_name, value) => {
        expect(value.length).toBeLessThanOrEqual(255);
        expect(helper.isValidSegment({ segment: value })).toBe(false);
        expect(helper.isValidObjectKey({ object: { key: `folder/${value}` } })).toBe(false);
        expect(helper.isValidBucketName({ bucket: { name: value } })).toBe(false);
      },
    );

    test('256 ASCII bytes are refused', () => {
      expect(helper.isValidSegment({ segment: 'a'.repeat(256) })).toBe(false);
    });

    test('a lone surrogate is refused even inside the byte limit', () => {
      expect(helper.isValidSegment({ segment: `${'a'.repeat(250)}\ud83d` })).toBe(false);
    });

    test('unicode names, dots inside names and nested keys stay valid', () => {
      expect(helper.isValidSegment({ segment: 'a.b.c.txt' })).toBe(true);
      expect(helper.isValidObjectKey({ object: { key: 'a/b/c.txt' } })).toBe(true);
      expect(helper.isValidObjectKey({ object: { key: 'ảnh/2024/ảnh đẹp.v2.png' } })).toBe(true);
    });
  });

  describe('whole key length in UTF-8 bytes', () => {
    const key = (segments: string[]) => segments.join('/');
    const isValid = (value: string) =>
      helper.isValidObjectKey({ object: { key: value }, maxDepth: 10 });

    test('1024 ASCII bytes are accepted and 1025 are refused', () => {
      const a = (length: number) => 'a'.repeat(length);

      expect(isValid(key([a(255), a(255), a(255), a(254), a(1)]))).toBe(true);
      expect(isValid(key([a(255), a(255), a(255), a(255), a(1)]))).toBe(false);
    });

    test('a multi-byte key counts its bytes, not its characters', () => {
      const segment = '写'.repeat(85);

      expect(isValid(key([segment, segment, segment, segment]))).toBe(true);

      const tooLong = key([segment, segment, segment, segment, segment]);

      expect(tooLong.length).toBeLessThanOrEqual(1024);
      expect(isValid(tooLong)).toBe(false);
    });
  });

  describe('isValidPath', () => {
    describe('valid paths', () => {
      test('should accept simple filename (no folder)', () => {
        expect(helper.isValidObjectKey({ object: { key: 'file.jpg' } })).toBe(true);
      });

      test('should accept single-level folder path', () => {
        expect(helper.isValidObjectKey({ object: { key: 'photos/avatar.jpg' } })).toBe(true);
      });

      test('should accept two-level folder path (default max)', () => {
        expect(helper.isValidObjectKey({ object: { key: 'photos/2024/avatar.jpg' } })).toBe(true);
      });

      test('should accept folder-only path (no trailing filename)', () => {
        expect(helper.isValidObjectKey({ object: { key: 'photos/2024' } })).toBe(true);
      });

      test('should accept names with dots, dashes, underscores', () => {
        expect(
          helper.isValidObjectKey({ object: { key: 'my-project/sub_folder/file.v2.tar.gz' } }),
        ).toBe(true);
      });

      test('should trim a leading slash', () => {
        expect(helper.isValidObjectKey({ object: { key: '/photos/file.jpg' } })).toBe(true);
      });
    });

    describe('invalid paths', () => {
      test('should reject empty string', () => {
        expect(helper.isValidObjectKey({ object: { key: '' } })).toBe(false);
      });

      test('should reject whitespace-only', () => {
        expect(helper.isValidObjectKey({ object: { key: '   ' } })).toBe(false);
      });

      test('should reject double slashes (empty segments)', () => {
        expect(helper.isValidObjectKey({ object: { key: 'photos//file.jpg' } })).toBe(false);
        expect(helper.isValidObjectKey({ object: { key: 'a///b' } })).toBe(false);
      });

      test('should reject path traversal', () => {
        expect(helper.isValidObjectKey({ object: { key: '../etc/passwd' } })).toBe(false);
        expect(helper.isValidObjectKey({ object: { key: 'photos/../../secret' } })).toBe(false);
        expect(helper.isValidObjectKey({ object: { key: 'photos/../passwords' } })).toBe(false);
      });

      test('should reject segments with shell special chars', () => {
        expect(helper.isValidObjectKey({ object: { key: 'photos/file;rm -rf' } })).toBe(false);
        expect(helper.isValidObjectKey({ object: { key: 'a|b/file.jpg' } })).toBe(false);
      });

      test('should reject paths exceeding default max depth (2 folders)', () => {
        // 3 folder levels + file = 4 segments, folderDepth=3 > default 2
        expect(helper.isValidObjectKey({ object: { key: 'a/b/c/file.jpg' } })).toBe(false);
      });

      test.each([
        ['a file key', 'photos/file.jpg/'],
        ['a key with a leading slash', '/photos/file.jpg/'],
        ['a directory marker', 'photos/'],
        ['a nested directory marker', 'a/b/'],
      ])('should reject %s ending with a slash', (_name, key) => {
        expect(helper.isValidObjectKey({ object: { key } })).toBe(false);
      });

      test('should reject paths that are only slashes', () => {
        expect(helper.isValidObjectKey({ object: { key: '/' } })).toBe(false);
        expect(helper.isValidObjectKey({ object: { key: '///' } })).toBe(false);
      });

      test('should reject overly long paths', () => {
        const longPath = 'a'.repeat(512) + '/' + 'b'.repeat(512) + '.jpg';
        expect(helper.isValidObjectKey({ object: { key: longPath } })).toBe(false);
      });
    });

    describe('custom maxDepth', () => {
      test('should allow deeper paths with higher maxDepth', () => {
        // 3 folder levels: a/b/c/file.jpg (folderDepth=3)
        expect(helper.isValidObjectKey({ object: { key: 'a/b/c/file.jpg' }, maxDepth: 3 })).toBe(
          true,
        );
        expect(helper.isValidObjectKey({ object: { key: 'a/b/c/d/file.jpg' }, maxDepth: 4 })).toBe(
          true,
        );
      });

      test('should restrict shallower with lower maxDepth', () => {
        // maxDepth=1: only 1 folder level allowed
        expect(helper.isValidObjectKey({ object: { key: 'photos/file.jpg' }, maxDepth: 1 })).toBe(
          true,
        );
        expect(
          helper.isValidObjectKey({ object: { key: 'photos/2024/file.jpg' }, maxDepth: 1 }),
        ).toBe(false);
      });

      test('should allow no folders with maxDepth=0', () => {
        expect(helper.isValidObjectKey({ object: { key: 'file.jpg' }, maxDepth: 0 })).toBe(true);
        expect(helper.isValidObjectKey({ object: { key: 'photos/file.jpg' }, maxDepth: 0 })).toBe(
          false,
        );
      });
    });

    describe('DEFAULT_MAX_FOLDER_DEPTH constant', () => {
      test('should be 2', () => {
        expect(BaseStorageHelper.DEFAULT_MAX_FOLDER_DEPTH).toBe(2);
      });
    });
  });

  describe('URL encode/decode safety', () => {
    test('segment-wise encoding preserves folder separators', () => {
      const objectName = 'photos/2024/my file.jpg';
      const encoded = objectName
        .split('/')
        .map((s) => encodeURIComponent(s))
        .join('/');
      expect(encoded).toBe('photos/2024/my%20file.jpg');
      expect(encoded).not.toContain('%2F'); // No encoded slashes
    });

    test('segment-wise decoding handles encoded segments', () => {
      const encoded = 'photos/2024/my%20file.jpg';
      const decoded = encoded
        .split('/')
        .map((s) => decodeURIComponent(s))
        .join('/');
      expect(decoded).toBe('photos/2024/my file.jpg');
    });

    test('double-encoding prevention', () => {
      const objectName = 'photos/my file.jpg';
      // First encode
      const encoded1 = objectName
        .split('/')
        .map((s) => encodeURIComponent(s))
        .join('/');
      // Decode and re-encode should be idempotent
      const decoded = encoded1
        .split('/')
        .map((s) => decodeURIComponent(s))
        .join('/');
      const encoded2 = decoded
        .split('/')
        .map((s) => encodeURIComponent(s))
        .join('/');
      expect(encoded1).toBe(encoded2);
    });

    test('handles special characters in folder names', () => {
      const objectName = 'my project/sub folder/file (1).jpg';
      const encoded = objectName
        .split('/')
        .map((s) => encodeURIComponent(s))
        .join('/');
      expect(encoded).toBe('my%20project/sub%20folder/file%20(1).jpg');
    });
  });
});
