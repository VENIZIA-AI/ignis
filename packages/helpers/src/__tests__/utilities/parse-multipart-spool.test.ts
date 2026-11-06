import { afterEach, describe, expect, test } from 'bun:test';
import fs, { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RequestUtility } from '@/utilities/request.utility';

const directories: string[] = [];

const spoolDir = () => {
  const directory = mkdtempSync(join(tmpdir(), 'multipart-spool-'));
  directories.push(directory);

  return directory;
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const contextOf = (formData: FormData) => ({ req: { formData: async () => formData } });

const filesOf = (count: number): FormData => {
  const formData = new FormData();

  for (let index = 0; index < count; index += 1) {
    formData.append('files', new File([`content-${index}`], `f${index}.txt`));
  }

  return formData;
};

describe('RequestUtility.parseMultipartBody - maxFiles', () => {
  test('more file parts than the limit is refused with 413 before anything is spooled', async () => {
    const uploadDir = spoolDir();
    let error: unknown;

    try {
      await RequestUtility.parseMultipartBody({
        context: contextOf(filesOf(4)),
        storage: 'disk',
        uploadDir,
        maxFiles: 3,
      });
    } catch (caught) {
      error = caught;
    }

    expect((error as { statusCode?: number }).statusCode).toBe(413);
    expect(readdirSync(uploadDir)).toEqual([]);
  });

  test('exactly the limit is accepted, text fields do not count', async () => {
    const formData = filesOf(3);
    formData.append('folderPath', 'a');
    formData.append('note', 'b');

    const result = await RequestUtility.parseMultipartBody({
      context: contextOf(formData),
      maxFiles: 3,
    });

    expect(result.files).toHaveLength(3);
    expect(result.fields).toEqual({ folderPath: 'a', note: 'b' });
  });

  test('no limit by default: the utility itself keeps its old behaviour', async () => {
    const result = await RequestUtility.parseMultipartBody({ context: contextOf(filesOf(50)) });

    expect(result.files).toHaveLength(50);
  });
});

describe('RequestUtility.parseMultipartBody - the refusals are specific', () => {
  test('the part limit answers with its own code', async () => {
    let error: unknown;

    try {
      await RequestUtility.parseMultipartBody({ context: contextOf(filesOf(2)), maxFiles: 1 });
    } catch (caught) {
      error = caught;
    }

    expect((error as { statusCode?: number }).statusCode).toBe(413);
    expect(JSON.stringify((error as { normalized?: unknown }).normalized)).toContain(
      'core.request.too_many_files',
    );
  });

  test.each([Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY])(
    'maxFiles %p is a configuration error, not a silent no-limit',
    async (maxFiles) => {
      let message = '';

      try {
        await RequestUtility.parseMultipartBody({ context: contextOf(filesOf(1)), maxFiles });
      } catch (caught) {
        message = (caught as Error).message;
      }

      expect(message).toContain('maxFiles must be a non-negative integer');
    },
  );
});

describe('RequestUtility.parseMultipartBody - a failure part-way removes what it spooled', () => {
  test('the files written before the failing part are removed', async () => {
    const uploadDir = spoolDir();
    // FormData copies a File on append, so the failing part is handed over through a form-data look-alike.
    const broken = new File(['x'], 'broken.txt');
    Object.defineProperty(broken, 'arrayBuffer', {
      value: () => Promise.reject(new Error('read failed')),
    });
    const parts: Array<[string, File]> = [
      ['files', new File(['one'], 'a.txt')],
      ['files', new File(['two'], 'b.txt')],
      ['files', broken],
    ];
    const formData = { entries: () => parts[Symbol.iterator]() } as unknown as FormData;

    let message = '';

    try {
      await RequestUtility.parseMultipartBody({
        context: contextOf(formData),
        storage: 'disk',
        uploadDir,
      });
    } catch (caught) {
      message = (caught as Error).message;
    }

    expect(message).toBe('read failed');
    expect(readdirSync(uploadDir)).toEqual([]);
  });

  test('a failure to remove one file does not hide the original error or stop the others', async () => {
    const uploadDir = spoolDir();
    const broken = new File(['x'], 'broken.txt');
    Object.defineProperty(broken, 'arrayBuffer', {
      value: () => Promise.reject(new Error('read failed')),
    });
    const parts: Array<[string, File]> = [
      ['files', new File(['one'], 'a.txt')],
      ['files', new File(['two'], 'b.txt')],
      ['files', broken],
    ];
    const formData = { entries: () => parts[Symbol.iterator]() } as unknown as FormData;
    const original = fs.rmSync;
    let calls = 0;

    fs.rmSync = ((target: fs.PathLike, options?: fs.RmOptions) => {
      calls += 1;

      if (calls === 1) {
        throw new Error('EBUSY');
      }

      return original(target, options);
    }) as typeof fs.rmSync;

    let message = '';

    try {
      await RequestUtility.parseMultipartBody({
        context: contextOf(formData),
        storage: 'disk',
        uploadDir,
      });
    } catch (caught) {
      message = (caught as Error).message;
    } finally {
      fs.rmSync = original;
    }

    expect(message).toBe('read failed');
    expect(readdirSync(uploadDir)).toHaveLength(1);
  });

  test('a write that dies midway leaves no partial file', async () => {
    const uploadDir = spoolDir();
    const parts: Array<[string, File]> = [
      ['files', new File(['one'], 'a.txt')],
      ['files', new File(['two'], 'b.txt')],
    ];
    const formData = { entries: () => parts[Symbol.iterator]() } as unknown as FormData;
    const original = fs.writeFileSync;
    let calls = 0;

    fs.writeFileSync = ((
      target: fs.PathOrFileDescriptor,
      data: string | NodeJS.ArrayBufferView,
    ) => {
      calls += 1;

      if (calls === 2) {
        original(target, 'xx');
        throw new Error('ENOSPC');
      }

      return original(target, data);
    }) as typeof fs.writeFileSync;

    let message = '';

    try {
      await RequestUtility.parseMultipartBody({
        context: contextOf(formData),
        storage: 'disk',
        uploadDir,
      });
    } catch (caught) {
      message = (caught as Error).message;
    } finally {
      fs.writeFileSync = original;
    }

    expect(message).toBe('ENOSPC');
    expect(readdirSync(uploadDir)).toEqual([]);
  });
});
