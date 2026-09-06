import { Corpora } from '@/common';
import { CorpusLoader } from '@/corpus';
import type { IDocument } from '@/corpus';
import { join } from 'node:path';
import { describe, expect, spyOn, test } from 'bun:test';

// __dirname, not import.meta: this package emits CommonJS.
const FIXTURES_ROOT = join(__dirname, '../fixtures/corpus');

describe('CorpusLoader', () => {
  test('loads a wiki document with its frontmatter, title and body', () => {
    const documents = CorpusLoader.getInstance().load({
      roots: [{ corpus: Corpora.WIKI, directory: join(FIXTURES_ROOT, 'wiki') }],
    });

    const guide = documents.find(document => document.path === 'guide.md');
    expect(guide).toBeDefined();
    expect(guide?.corpus).toBe(Corpora.WIKI);
    expect(guide?.title).toBe('Artifact registration guide');
    expect(guide?.frontmatter.title).toBe('Artifact registration guide');
    expect(guide?.frontmatter.description).toBe(
      'How artifacts are registered and verified during boot.',
    );
    expect(guide?.body.trim().startsWith('# Artifact registration guide')).toBe(true);
  });

  test('loads a knowledge document under the okf corpus', () => {
    const documents = CorpusLoader.getInstance().load({
      roots: [{ corpus: Corpora.KNOWLEDGE, directory: join(FIXTURES_ROOT, 'knowledge') }],
    });

    expect(documents).toHaveLength(1);
    expect(documents[0].corpus).toBe(Corpora.KNOWLEDGE);
    expect(documents[0].path).toBe('concept.md');
    expect(documents[0].title).toBe('Sample concept');
  });

  test('loads a changelog document keyed by its file name', () => {
    const documents = CorpusLoader.getInstance().load({
      roots: [{ corpus: Corpora.CHANGELOG, directory: join(FIXTURES_ROOT, 'changelogs') }],
    });

    expect(documents).toHaveLength(1);
    expect(documents[0].corpus).toBe(Corpora.CHANGELOG);
    expect(documents[0].path).toBe('2026-01-01-thing.md');
    expect(documents[0].title).toBe('A Sample Changelog Entry');
  });

  test('excludes paths under an excluded prefix', () => {
    const documents = CorpusLoader.getInstance().load({
      roots: [
        { corpus: Corpora.WIKI, directory: join(FIXTURES_ROOT, 'wiki'), exclude: ['excluded'] },
      ],
    });

    expect(documents.some(document => document.path.startsWith('excluded/'))).toBe(false);
    expect(documents.some(document => document.path === 'guide.md')).toBe(true);
  });

  test('excludes an exact file match, not only a directory prefix', () => {
    const documents = CorpusLoader.getInstance().load({
      roots: [
        { corpus: Corpora.WIKI, directory: join(FIXTURES_ROOT, 'wiki'), exclude: ['guide.md'] },
      ],
    });

    expect(documents.some(document => document.path === 'guide.md')).toBe(false);
    expect(documents.some(document => document.path === 'excluded/skip-me.md')).toBe(true);
  });

  test('skips a document with invalid YAML frontmatter, records it, and warns through the logger', () => {
    const loader = CorpusLoader.getInstance();
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => undefined);
    let documents: IDocument[];

    try {
      documents = loader.load({
        roots: [{ corpus: Corpora.WIKI, directory: join(FIXTURES_ROOT, 'wiki') }],
      });

      // Must run before `mockRestore()`: restoring a spy also clears its recorded calls.
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }

    expect(documents.some(document => document.path === 'broken.md')).toBe(false);
    expect(documents.some(document => document.path === 'guide.md')).toBe(true);
    expect(loader.skipped).toHaveLength(1);
    expect(loader.skipped[0].corpus).toBe(Corpora.WIKI);
    expect(loader.skipped[0].path).toBe('broken.md');
    expect(loader.skipped[0].error).toContain('[parseFrontmatter] invalid YAML frontmatter');
    expect(loader.skipped[0].error).toContain('broken.md');
  });

  test('resets `skipped` on every call', () => {
    const loader = CorpusLoader.getInstance();
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      loader.load({ roots: [{ corpus: Corpora.WIKI, directory: join(FIXTURES_ROOT, 'wiki') }] });
      expect(loader.skipped).toHaveLength(1);

      loader.load({
        roots: [{ corpus: Corpora.KNOWLEDGE, directory: join(FIXTURES_ROOT, 'knowledge') }],
      });
      expect(loader.skipped).toHaveLength(0);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
