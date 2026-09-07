import { Corpora } from '@/common';
import { QueryPlanner } from '@/search/planner';
import { describe, expect, test } from 'bun:test';

describe('QueryPlanner', () => {
  const planner = new QueryPlanner();

  test('two plain words become an AND-joined plan and an OR-joined plan', () => {
    const plan = planner.plan({ query: 'register artifacts' });
    expect(plan.and).toBe('"register" AND "artifacts"');
    expect(plan.or).toBe('"register" OR "artifacts"');
    expect(plan.corpus).toBeUndefined();
  });

  test('a quoted phrase stays one token instead of splitting into separate AND terms', () => {
    const plan = planner.plan({ query: '"release playbook"' });
    expect(plan.and).toBe('"release playbook"');
    expect(plan.or).toBe('"release playbook"');
  });

  test('a corpus: prefix sets the corpus filter and drops out of the term list', () => {
    const plan = planner.plan({ query: 'corpus:knowledge purity' });
    expect(plan.corpus).toBe(Corpora.KNOWLEDGE);
    expect(plan.and).toBe('"purity"');
    expect(plan.or).toBe('"purity"');
  });

  test('an unrecognised corpus: value sets no filter and is quoted as a literal term instead', () => {
    const plan = planner.plan({ query: 'corpus:bogus purity' });
    expect(plan.corpus).toBeUndefined();
    expect(plan.and).toBe('"corpus:bogus" AND "purity"');
    expect(plan.or).toBe('"corpus:bogus" OR "purity"');
  });

  test('a trailing * turns a word into a prefix query, the star kept outside the quotes', () => {
    const plan = planner.plan({ query: 'resp*' });
    expect(plan.and).toBe('"resp"*');
    expect(plan.or).toBe('"resp"*');
  });

  test('FTS5 special characters are neutralised because every term is quoted', () => {
    // Unquoted, fts5 reads `config:value` as a `<column>:<token>` filter and throws "no such
    // column: config" - quoting keeps it a literal term instead.
    const plan = planner.plan({ query: 'config:value' });
    expect(plan.and).toBe('"config:value"');
    expect(plan.or).toBe('"config:value"');
  });

  describe('stopwords', () => {
    test('filler words are dropped when a content word remains, matching the plan without them', () => {
      const withFiller = planner.plan({ query: 'how do I register artifacts' });
      const withoutFiller = planner.plan({ query: 'register artifacts' });
      expect(withFiller).toEqual(withoutFiller);
    });

    test('case does not matter - a capitalised stopword is still dropped', () => {
      const plan = planner.plan({ query: 'How Do I register artifacts' });
      expect(plan.and).toBe('"register" AND "artifacts"');
    });

    test('a query made only of stopwords keeps them instead of searching on nothing', () => {
      const plan = planner.plan({ query: 'how do' });
      expect(plan.and).toBe('"how" AND "do"');
      expect(plan.or).toBe('"how" OR "do"');
    });

    test('a quoted phrase is never filtered, even if every word in it is a stopword', () => {
      const plan = planner.plan({ query: '"how to" register' });
      expect(plan.and).toBe('"how to" AND "register"');
    });
  });
});
