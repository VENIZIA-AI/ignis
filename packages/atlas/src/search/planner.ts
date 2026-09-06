import { Corpora } from '@/common';
import type { TCorpus } from '@/common';
import type { IQueryPlan } from './common';

const TOKEN_PATTERN = /"([^"]*)"|(\S+)/g;
const CORPUS_PREFIX_PATTERN = /^corpus:(.+)$/;

const isCorpus = (value: string): value is TCorpus => Corpora.isValid(value);

const escapeQuotes = (value: string): string => value.replace(/"/g, '""');

/** Wraps one term for FTS5 `MATCH`: quoting neutralises every special character in it. */
const quoteTerm = (value: string): string => `"${escapeQuotes(value)}"`;

/** Splits a free-text query into already-quoted FTS5 terms, plus an optional `corpus:` filter. */
const termsOf = (opts: { query: string }): { terms: string[]; corpus?: TCorpus } => {
  const terms: string[] = [];
  let corpus: TCorpus | undefined;

  for (const match of opts.query.matchAll(TOKEN_PATTERN)) {
    const [, phrase, word] = match;

    if (phrase !== undefined) {
      terms.push(quoteTerm(phrase));
      continue;
    }
    if (word === undefined) {
      continue;
    }

    const corpusMatch = word.match(CORPUS_PREFIX_PATTERN);
    if (corpusMatch && isCorpus(corpusMatch[1])) {
      corpus = corpusMatch[1];
      continue;
    }

    const isPrefix = word.length > 1 && word.endsWith('*');
    terms.push(isPrefix ? `${quoteTerm(word.slice(0, -1))}*` : quoteTerm(word));
  }

  return { terms, corpus };
};

/**
 * Builds an AND-first and an OR-fallback FTS5 `MATCH` string from one free-text query. A quoted
 * phrase stays one term, `corpus:<value>` sets the corpus filter instead of becoming a term, and a
 * trailing `*` on a bare word becomes a prefix query. Every term is quoted, which neutralises the
 * FTS5 syntax characters (`:`, `(`, `)`, `-`, ...) a raw term could otherwise trip over.
 */
export class QueryPlanner {
  plan(opts: { query: string }): IQueryPlan {
    const { terms, corpus } = termsOf({ query: opts.query });
    return { and: terms.join(' AND '), or: terms.join(' OR '), corpus };
  }
}
