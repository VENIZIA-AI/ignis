import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
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
});
