import { Corpora } from '@/common';
import { QueryPlanner } from '@/index/planner';
import { describe, expect, test } from 'bun:test';

// `@/index` resolves to the package's top-level `src/index.ts` barrel, not `src/index/index.ts` -
// import the submodule file directly.

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
});
