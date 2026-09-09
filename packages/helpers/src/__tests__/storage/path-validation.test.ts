/** Storage Path Validation Test Suite */

import { describe, test, expect } from 'bun:test';
import { BaseStorageHelper } from '@/modules/storage/base';
import {
  IBucketInfo,
  IBucketRef,
  IFileStat,
  IListObjectsOptions,
  IObjectInfo,
  IObjectLocation,
  IObjectRef,
  IUploadFile,
} from '@/modules';
import { Readable } from 'node:stream';

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

      test('should trim leading/trailing slashes', () => {
        expect(helper.isValidObjectKey({ object: { key: '/photos/file.jpg' } })).toBe(true);
        expect(helper.isValidObjectKey({ object: { key: 'photos/file.jpg/' } })).toBe(true);
        expect(helper.isValidObjectKey({ object: { key: '/photos/file.jpg/' } })).toBe(true);
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
        .map(s => encodeURIComponent(s))
        .join('/');
      expect(encoded).toBe('photos/2024/my%20file.jpg');
      expect(encoded).not.toContain('%2F'); // No encoded slashes
    });

    test('segment-wise decoding handles encoded segments', () => {
      const encoded = 'photos/2024/my%20file.jpg';
      const decoded = encoded
        .split('/')
        .map(s => decodeURIComponent(s))
        .join('/');
      expect(decoded).toBe('photos/2024/my file.jpg');
    });

    test('double-encoding prevention', () => {
      const objectName = 'photos/my file.jpg';
      // First encode
      const encoded1 = objectName
        .split('/')
        .map(s => encodeURIComponent(s))
        .join('/');
      // Decode and re-encode should be idempotent
      const decoded = encoded1
        .split('/')
        .map(s => decodeURIComponent(s))
        .join('/');
      const encoded2 = decoded
        .split('/')
        .map(s => encodeURIComponent(s))
        .join('/');
      expect(encoded1).toBe(encoded2);
    });

    test('handles special characters in folder names', () => {
      const objectName = 'my project/sub folder/file (1).jpg';
      const encoded = objectName
        .split('/')
        .map(s => encodeURIComponent(s))
        .join('/');
      expect(encoded).toBe('my%20project/sub%20folder/file%20(1).jpg');
    });
  });
});
