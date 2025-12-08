import path from 'node:path';
import fs from 'node:fs/promises';
import fg from 'fast-glob';
import matter from 'gray-matter';
import Fuse from 'fuse.js';
import { PATHS } from '../config';

interface Doc {
  id: string;
  title: string;
  content: string;
  category: string;
}

let _docs: Doc[] = [];
let _fuse: Fuse<Doc> | null = null;

/**
 * Loads and caches documentation from the wiki.
 */
export const loadDocumentation = async (): Promise<Doc[]> => {
  if (_docs.length > 0) return _docs;

  const files = await fg('**/*.md', {
    cwd: PATHS.wiki,
    absolute: true,
    ignore: ['node_modules'],
  });

  const docs = await Promise.all(
    files.map(async file => {
      const rawContent = await fs.readFile(file, 'utf-8');
      const { data, content } = matter(rawContent);

      return {
        id: file,
        title: data.title || path.basename(file, '.md'),
        content,
        category: data.category || 'Uncategorized',
      };
    }),
  );

  _docs = docs;
  _fuse = new Fuse(_docs, {
    keys: ['title', 'content'],
    includeScore: true,
    threshold: 0.4,
  });

  return _docs;
}

/**
 * Searches the loaded documentation.
 * @param query The search query.
 */
export const searchDocs = async (query: string) => {
  if (!_fuse) await loadDocumentation();

  const results = _fuse!.search(query);

  return results.map(result => ({
    id: result.item.id,
    title: result.item.title,
    snippet: result.item.content.substring(0, 300),
    score: result.score,
  }));
}

/**
 * Gets the full content of a specific document.
 * @param id The file path (ID) of the document.
 */
export const getDocContent = async (id: string): Promise<string | null> => {
  if (_docs.length === 0) await loadDocumentation();

  const doc = _docs.find(d => d.id === id);
  return doc ? doc.content : null;
}
