import { describe, expect, test } from 'bun:test';
import { MeilisearchQueryDialect } from '@/search/meilisearch/repositories/dialect/query-dialect';
import { TypesenseQueryDialect } from '@/search/typesense/repositories/dialect/query-dialect';

describe('a logical group member that is no object', () => {
  for (const [name, dialect] of [
    ['Typesense', new TypesenseQueryDialect()],
    ['Meilisearch', new MeilisearchQueryDialect()],
  ] as const) {
    for (const group of ['and', 'or']) {
      test(`${name} refuses it in \`${group}\``, () => {
        for (const member of [undefined, null, 7, 'x', []]) {
          // As an untyped caller would hand it: the type refuses such a member.
          const where = { [group]: [{ id: 'a' }, member] };

          expect(() => Reflect.apply(dialect.compileWhere, dialect, [{ where }])).toThrow(
            /logical group member to be an object/,
          );
        }
      });
    }
  }
});
