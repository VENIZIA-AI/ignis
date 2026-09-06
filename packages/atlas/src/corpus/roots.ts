import { Corpora } from '@/common';
import { join } from 'node:path';
import type { ICorpusRoot } from './common';

const WIKI_DIRECTORY = 'docs/wiki/content';
const CHANGELOG_DIRECTORY = 'docs/wiki/content/changelogs';
const KNOWLEDGE_DIRECTORY = '.agents/knowledge';

/**
 * The three live-tree roots for repo mode, rooted at `repositoryRoot`: `wiki` carves its
 * `changelogs` subtree out into its own root, and `knowledge` carves out `knowledge-tools`.
 */
export const resolveRepositoryRoots = (opts: { repositoryRoot: string }): ICorpusRoot[] => {
  const { repositoryRoot } = opts;

  return [
    {
      corpus: Corpora.WIKI,
      directory: join(repositoryRoot, WIKI_DIRECTORY),
      exclude: ['changelogs'],
    },
    { corpus: Corpora.CHANGELOG, directory: join(repositoryRoot, CHANGELOG_DIRECTORY) },
    {
      corpus: Corpora.KNOWLEDGE,
      directory: join(repositoryRoot, KNOWLEDGE_DIRECTORY),
      exclude: ['knowledge-tools'],
    },
  ];
};
