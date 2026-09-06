import { Corpora } from '@/common';
import type { TCorpus } from '@/common';
import { Stopwords } from './common';
import type { IQueryPlan } from './common';

const TOKEN_PATTERN = /"([^"]*)"|(\S+)/g;
const CORPUS_PREFIX_PATTERN = /^corpus:(.+)$/;

const isCorpus = (value: string): value is TCorpus => Corpora.isValid(value);

const escapeQuotes = (value: string): string => value.replace(/"/g, '""');

/** Wraps one term for FTS5 `MATCH`: quoting neutralises every special character in it. */
const quoteTerm = (value: string): string => `"${escapeQuotes(value)}"`;

/** A bare (non-phrase) query word, its trailing `*` already split off. */
interface IBareWord {
  raw: string;
  isPrefix: boolean;
}

const isStopword = (word: string): boolean => Stopwords.isValid(word.toLowerCase());

const quoteWord = (word: IBareWord): string =>
  word.isPrefix ? `${quoteTerm(word.raw)}*` : quoteTerm(word.raw);

/**
 * Splits a free-text query into already-quoted FTS5 terms, plus an optional `corpus:` filter.
 * A bare word that is a stopword (`how`, `do`, ...) is dropped, unless every bare word is one - a
 * query made only of stopwords keeps them rather than searching on nothing. A quoted phrase is
 * never filtered - it was typed as one deliberate unit.
 */
const termsOf = (opts: { query: string }): { terms: string[]; corpus?: TCorpus } => {
  const phraseTerms: string[] = [];
  const bareWords: IBareWord[] = [];
  let corpus: TCorpus | undefined;

  for (const match of opts.query.matchAll(TOKEN_PATTERN)) {
    const [, phrase, word] = match;

    if (phrase !== undefined) {
      phraseTerms.push(quoteTerm(phrase));
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
    bareWords.push({ raw: isPrefix ? word.slice(0, -1) : word, isPrefix });
  }

  const contentWords = bareWords.filter(word => !isStopword(word.raw));
  const selectedWords = contentWords.length > 0 ? contentWords : bareWords;

  return { terms: [...phraseTerms, ...selectedWords.map(quoteWord)], corpus };
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
