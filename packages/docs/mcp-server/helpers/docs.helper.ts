import fg from 'fast-glob';
import Fuse from 'fuse.js';
import matter from 'gray-matter';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MCPConfigs, Paths } from '../common';
import { Logger } from './logger.helper';

interface IDoc {
  id: string;
  title: string;
  content: string;
  category: string;
  filePath: string;
}

interface ISearchOptions {
  query: string;
  limit?: number;
}

// --------------------------------------------------------------------------------------------------
export class DocsHelper {
  private static _docs: IDoc[] = [];
  private static _fuse: Fuse<IDoc> | null = null;

  /**
   * Loads and caches documentation from the wiki.
   */
  static async load(): Promise<IDoc[]> {
    if (this._docs.length > 0) {
      return this._docs;
    }

    try {
      const files = await fg('**/*.md', {
        cwd: Paths.WIKI,
        absolute: true,
        ignore: ['node_modules', 'changelogs/**'],
      });

      if (files.length === 0) {
        Logger.warn(`No documentation files found in ${Paths.WIKI}`);
        return [];
      }

      this._docs = await Promise.all(
        files.map(file => {
          return new Promise<IDoc>((resolve, reject) => {
            fs.readFile(file, 'utf-8')
              .then(rawContent => {
                const { data, content } = matter(rawContent);

                resolve({
                  id: path.relative(Paths.WIKI, file),
                  title: data.title || path.basename(file, '.md'),
                  content,
                  category: data.category || 'Uncategorized',
                  filePath: file,
                });
              })
              .catch(reject);
          });
        }),
      );

      this._fuse = new Fuse(this._docs, { ...MCPConfigs.fuse, keys: MCPConfigs.fuse.keys });

      Logger.info(`Loaded ${this._docs.length} documentation files`);
      return this._docs;
    } catch (error) {
      Logger.error('Failed to load documentation:', error);
      throw new Error(
        `Documentation loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Clears the documentation cache.
   */
  static clearCache(): void {
    this._docs = [];
    this._fuse = null;
    Logger.debug('Documentation cache cleared');
  }

  /**
   * Generates a smart snippet from content.
   */
  private static generateSnippet(opts: { content: string; maxLength?: number }): string {
    const { content, maxLength = MCPConfigs.search.snippetLength } = opts;
    if (content.length <= maxLength) {
      return content;
    }

    const trimmed = content.substring(0, maxLength);
    const lastSpace = trimmed.lastIndexOf(' ');

    return (lastSpace > 0 ? trimmed.substring(0, lastSpace) : trimmed) + '...';
  }

  /**
   * Searches the loaded documentation.
   */
  static async searchDocuments(opts: ISearchOptions) {
    if (!this._fuse) {
      await this.load();
    }

    if (!this._fuse) {
      return [];
    }

    const limit = opts.limit ?? MCPConfigs.search.defaultLimit;
    const results = this._fuse.search(opts.query).slice(0, limit);

    return results.map(result => ({
      id: result.item.id,
      title: result.item.title,
      category: result.item.category,
      snippet: this.generateSnippet({ content: result.item.content }),
      score: result.score,
    }));
  }

  /**
   * Gets the full content of a specific document.
   */
  static async getDocumentContent(opts: { id: string }): Promise<string | null> {
    if (this._docs.length === 0) {
      await this.load();
    }

    const doc = this._docs.find(d => d.id === opts.id);
    if (doc) {
      return doc.content;
    }
    return null;
  }

  /**
   * Lists all available documentation files.
   */
  static async listDocumentFiles(opts: { category?: string }) {
    if (this._docs.length === 0) {
      await this.load();
    }

    const filteredDocs = opts.category
      ? this._docs.filter(d => d.category === opts.category)
      : this._docs;

    return filteredDocs.map(doc => ({
      id: doc.id,
      title: doc.title,
      category: doc.category,
    }));
  }

  /**
   * Lists all unique categories in the documentation.
   */
  static async listCategories(): Promise<string[]> {
    if (this._docs.length === 0) {
      await this.load();
    }

    const categories = new Set(this._docs.map(d => d.category));
    return Array.from(categories).sort();
  }

  /**
   * Gets metadata about a specific document.
   */
  static async getDocumentMetadata(opts: { id: string }) {
    if (this._docs.length === 0) {
      await this.load();
    }

    const doc = this._docs.find(d => d.id === opts.id);
    if (!doc) {
      return null;
    }

    try {
      const stats = await fs.stat(doc.filePath);

      return {
        id: doc.id,
        title: doc.title,
        category: doc.category,
        wordCount: doc.content.split(/\s+/).filter(Boolean).length,
        charCount: doc.content.length,
        lastModified: stats.mtime,
        size: stats.size,
      };
    } catch (error) {
      Logger.error(`Failed to get metadata for ${opts.id}:`, error);
      return {
        id: doc.id,
        title: doc.title,
        category: doc.category,
        wordCount: doc.content.split(/\s+/).filter(Boolean).length,
        charCount: doc.content.length,
      };
    }
  }
}
