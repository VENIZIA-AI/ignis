/** Storage Path Validation Test Suite */

import { describe, test, expect } from 'bun:test';
import { BaseStorageHelper } from '@/modules/storage/base';
import { IBucketInfo, IUploadFile, IUploadResult, IFileStat } from '@/modules';
import { Readable } from 'node:stream';

// Concrete subclass to test abstract base methods
class TestHelper extends BaseStorageHelper {
  override isBucketExists(_opts: { name: string }): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  override getBuckets(): Promise<IBucketInfo[]> {
    throw new Error('Method not implemented.');
  }
  override getBucket(_opts: { name: string }): Promise<IBucketInfo | null> {
    throw new Error('Method not implemented.');
  }
  override createBucket(_opts: { name: string }): Promise<IBucketInfo | null> {
    throw new Error('Method not implemented.');
  }
  override removeBucket(_opts: { name: string }): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  override upload(_opts: {
    bucket: string;
    files: IUploadFile[];
    normalizeNameFn?: (_opts: { originalName: string; folderPath?: string }) => string;
    normalizeLinkFn?: (_opts: { bucketName: string; normalizeName: string }) => string;
  }): Promise<IUploadResult[]> {
    throw new Error('Method not implemented.');
  }
  override getFile(_opts: { bucket: string; name: string; options?: any }): Promise<Readable> {
    throw new Error('Method not implemented.');
  }
  override getStat(_opts: { bucket: string; name: string }): Promise<IFileStat> {
    throw new Error('Method not implemented.');
  }
  override removeObject(_opts: { bucket: string; name: string }): Promise<void> {
    throw new Error('Method not implemented.');
  }
  override removeObjects(_opts: { bucket: string; names: string[] }): Promise<void> {
    throw new Error('Method not implemented.');
  }
  override listObjects(_opts: {
    bucket: string;
    prefix?: string;
    useRecursive?: boolean;
    maxKeys?: number;
  }): Promise<import('../..').IObjectInfo[]> {
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
      expect(helper.isValidName('file.jpg')).toBe(true);
      expect(helper.isValidName('my-photo.png')).toBe(true);
      expect(helper.isValidName('document_v2.pdf')).toBe(true);
    });

    test('should reject names with slashes', () => {
      expect(helper.isValidName('folder/file.jpg')).toBe(false);
      expect(helper.isValidName('a/b/c')).toBe(false);
    });

    test('should reject names with path traversal', () => {
      expect(helper.isValidName('..')).toBe(false);
      expect(helper.isValidName('../file.jpg')).toBe(false);
    });

    test('should reject empty or whitespace names', () => {
      expect(helper.isValidName('')).toBe(false);
      expect(helper.isValidName('   ')).toBe(false);
    });

    test('should reject names with shell special chars', () => {
      expect(helper.isValidName('file;rm -rf')).toBe(false);
      expect(helper.isValidName('file|cat')).toBe(false);
      expect(helper.isValidName('file`id`')).toBe(false);
    });
  });

  describe('isValidPath', () => {
    describe('valid paths', () => {
      test('should accept simple filename (no folder)', () => {
        expect(helper.isValidPath('file.jpg')).toBe(true);
      });

      test('should accept single-level folder path', () => {
        expect(helper.isValidPath('photos/avatar.jpg')).toBe(true);
      });

      test('should accept two-level folder path (default max)', () => {
        expect(helper.isValidPath('photos/2024/avatar.jpg')).toBe(true);
      });

      test('should accept folder-only path (no trailing filename)', () => {
        expect(helper.isValidPath('photos/2024')).toBe(true);
      });

      test('should accept names with dots, dashes, underscores', () => {
        expect(helper.isValidPath('my-project/sub_folder/file.v2.tar.gz')).toBe(true);
      });

      test('should trim leading/trailing slashes', () => {
        expect(helper.isValidPath('/photos/file.jpg')).toBe(true);
        expect(helper.isValidPath('photos/file.jpg/')).toBe(true);
        expect(helper.isValidPath('/photos/file.jpg/')).toBe(true);
      });
    });

    describe('invalid paths', () => {
      test('should reject empty string', () => {
        expect(helper.isValidPath('')).toBe(false);
      });

      test('should reject whitespace-only', () => {
        expect(helper.isValidPath('   ')).toBe(false);
      });

      test('should reject double slashes (empty segments)', () => {
        expect(helper.isValidPath('photos//file.jpg')).toBe(false);
        expect(helper.isValidPath('a///b')).toBe(false);
      });

      test('should reject path traversal', () => {
        expect(helper.isValidPath('../etc/passwd')).toBe(false);
        expect(helper.isValidPath('photos/../../secret')).toBe(false);
        expect(helper.isValidPath('photos/../passwords')).toBe(false);
      });

      test('should reject segments with shell special chars', () => {
        expect(helper.isValidPath('photos/file;rm -rf')).toBe(false);
        expect(helper.isValidPath('a|b/file.jpg')).toBe(false);
      });

      test('should reject paths exceeding default max depth (2 folders)', () => {
        // 3 folder levels + file = 4 segments, folderDepth=3 > default 2
        expect(helper.isValidPath('a/b/c/file.jpg')).toBe(false);
      });

      test('should reject paths that are only slashes', () => {
        expect(helper.isValidPath('/')).toBe(false);
        expect(helper.isValidPath('///')).toBe(false);
      });

      test('should reject overly long paths', () => {
        const longPath = 'a'.repeat(512) + '/' + 'b'.repeat(512) + '.jpg';
        expect(helper.isValidPath(longPath)).toBe(false);
      });
    });

    describe('custom maxDepth', () => {
      test('should allow deeper paths with higher maxDepth', () => {
        // 3 folder levels: a/b/c/file.jpg (folderDepth=3)
        expect(helper.isValidPath('a/b/c/file.jpg', { maxDepth: 3 })).toBe(true);
        expect(helper.isValidPath('a/b/c/d/file.jpg', { maxDepth: 4 })).toBe(true);
      });

      test('should restrict shallower with lower maxDepth', () => {
        // maxDepth=1: only 1 folder level allowed
        expect(helper.isValidPath('photos/file.jpg', { maxDepth: 1 })).toBe(true);
        expect(helper.isValidPath('photos/2024/file.jpg', { maxDepth: 1 })).toBe(false);
      });

      test('should allow no folders with maxDepth=0', () => {
        expect(helper.isValidPath('file.jpg', { maxDepth: 0 })).toBe(true);
        expect(helper.isValidPath('photos/file.jpg', { maxDepth: 0 })).toBe(false);
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
