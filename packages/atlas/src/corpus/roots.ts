import { Corpora } from '@/common';
import { join } from 'node:path';
import type { ICorpusRoot } from './common';

const WIKI_DIRECTORY = 'docs/wiki/content';
const CHANGELOG_DIRECTORY = 'docs/wiki/content/changelogs';
const KNOWLEDGE_DIRECTORY = '.agents/knowledge';

/**
 * The three live-tree roots for repo mode, rooted at `repoRoot`: `wiki` carves its `changelogs`
 * subtree out into its own root, and `knowledge` carves out `knowledge-tools`.
 */
export const resolveRepoRoots = (opts: { repoRoot: string }): ICorpusRoot[] => {
  const { repoRoot } = opts;

  return [
    { corpus: Corpora.WIKI, directory: join(repoRoot, WIKI_DIRECTORY), exclude: ['changelogs'] },
    { corpus: Corpora.CHANGELOG, directory: join(repoRoot, CHANGELOG_DIRECTORY) },
    {
      corpus: Corpora.KNOWLEDGE,
      directory: join(repoRoot, KNOWLEDGE_DIRECTORY),
      exclude: ['knowledge-tools'],
    },
  ];
};
