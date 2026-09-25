/** Office files are what a back office uploads most; each resolves to its registered type, not octet-stream. */

import { describe, expect, test } from 'bun:test';
import { ContentTypes, ContentTypeTable, FileExtensions } from '@/common';

describe('ContentTypeTable - office and archive types', () => {
  test.each([
    ['stock.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['stock.xls', 'application/vnd.ms-excel'],
    ['stock.csv', 'text/csv'],
    ['letter.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['letter.doc', 'application/msword'],
    ['deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['deck.ppt', 'application/vnd.ms-powerpoint'],
    ['letter.odt', 'application/vnd.oasis.opendocument.text'],
    ['stock.ods', 'application/vnd.oasis.opendocument.spreadsheet'],
    ['bundle.zip', 'application/zip'],
    ['notes.txt', 'text/plain'],
  ])('%s -> %s', (filename, contentType) => {
    expect(ContentTypeTable.resolve({ filename })).toBe(contentType);
  });

  test('the extension match ignores case, as it does for every other type', () => {
    expect(ContentTypeTable.resolve({ filename: 'Kiểm kê.XLSX' })).toBe(ContentTypes.XLSX);
  });

  test('every extension is also a runtime-checkable value', () => {
    for (const extension of ['.xlsx', '.xls', '.docx', '.doc', '.pptx', '.ppt', '.odt', '.ods']) {
      expect(FileExtensions.isValid(extension)).toBe(true);
      expect(ContentTypes.isValid(ContentTypeTable.resolve({ filename: `a${extension}` }))).toBe(
        true,
      );
    }
  });

  test('an unknown extension still falls back to octet-stream', () => {
    expect(ContentTypeTable.resolve({ filename: 'archive.7z' })).toBe(ContentTypes.OCTET_STREAM);
  });
});
