/** BunS3Helper tagging XML builder/parser - the hand-written replacement for a full XML parser (Task 4) */

import { buildTaggingXml, parseTaggingXml } from '@/modules/storage/bun-s3/utility';
import { describe, expect, test } from 'bun:test';

describe('buildTaggingXml', () => {
  test('builds one tag', () => {
    expect(buildTaggingXml({ tags: { temp: 'true' } })).toBe(
      '<Tagging><TagSet><Tag><Key>temp</Key><Value>true</Value></Tag></TagSet></Tagging>',
    );
  });

  test('builds several tags in insertion order', () => {
    expect(buildTaggingXml({ tags: { temp: 'true', totalRows: '120' } })).toBe(
      '<Tagging><TagSet>' +
        '<Tag><Key>temp</Key><Value>true</Value></Tag>' +
        '<Tag><Key>totalRows</Key><Value>120</Value></Tag>' +
        '</TagSet></Tagging>',
    );
  });

  test('builds an empty tag set', () => {
    expect(buildTaggingXml({ tags: {} })).toBe('<Tagging><TagSet></TagSet></Tagging>');
  });

  test('escapes &, <, >, " and \' in both key and value', () => {
    const xml = buildTaggingXml({ tags: { 'a&b<c>d"e\'f': 'x&y<z>w"v\'u' } });

    expect(xml).toBe(
      '<Tagging><TagSet><Tag>' +
        '<Key>a&amp;b&lt;c&gt;d&quot;e&apos;f</Key>' +
        '<Value>x&amp;y&lt;z&gt;w&quot;v&apos;u</Value>' +
        '</Tag></TagSet></Tagging>',
    );
  });
});

describe('parseTaggingXml', () => {
  test('parses an empty self-closing TagSet', () => {
    expect(parseTaggingXml({ xml: '<Tagging><TagSet/></Tagging>' })).toEqual({});
  });

  test('parses an empty open/close TagSet', () => {
    expect(parseTaggingXml({ xml: '<Tagging><TagSet></TagSet></Tagging>' })).toEqual({});
  });

  test('parses one tag', () => {
    const xml = '<Tagging><TagSet><Tag><Key>temp</Key><Value>true</Value></Tag></TagSet></Tagging>';
    expect(parseTaggingXml({ xml: xml })).toEqual({ temp: 'true' });
  });

  test('parses several tags', () => {
    const xml =
      '<Tagging><TagSet>' +
      '<Tag><Key>temp</Key><Value>true</Value></Tag>' +
      '<Tag><Key>totalRows</Key><Value>120</Value></Tag>' +
      '</TagSet></Tagging>';

    expect(parseTaggingXml({ xml: xml })).toEqual({ temp: 'true', totalRows: '120' });
  });

  test('unescapes a value containing &amp; and &lt;', () => {
    const xml =
      '<Tagging><TagSet><Tag><Key>label</Key><Value>Q&amp;A &lt;draft&gt;</Value></Tag></TagSet></Tagging>';

    expect(parseTaggingXml({ xml: xml })).toEqual({ label: 'Q&A <draft>' });
  });

  test('trims surrounding whitespace around key and value', () => {
    const xml = [
      '<Tagging><TagSet><Tag>',
      '  <Key>\n    temp\n  </Key>',
      '  <Value>\n    true\n  </Value>',
      '</Tag></TagSet></Tagging>',
    ].join('\n');

    expect(parseTaggingXml({ xml: xml })).toEqual({ temp: 'true' });
  });

  test('throws a getError on a malformed body instead of returning a half-parsed object', () => {
    expect(() => parseTaggingXml({ xml: 'not xml at all' })).toThrow();
  });

  test('throws a getError when a Tag is missing its Value', () => {
    const xml = '<Tagging><TagSet><Tag><Key>temp</Key></Tag></TagSet></Tagging>';
    expect(() => parseTaggingXml({ xml: xml })).toThrow();
  });

  test('round trip: build then parse returns the original object', () => {
    const original = { temp: 'true', totalRows: '120', validated: 'false' };
    expect(parseTaggingXml({ xml: buildTaggingXml({ tags: original }) })).toEqual(original);
  });

  test('round trip survives special characters', () => {
    const original = { 'a&b<c>d"e\'f': 'x&y<z>w"v\'u' };
    expect(parseTaggingXml({ xml: buildTaggingXml({ tags: original }) })).toEqual(original);
  });
});
