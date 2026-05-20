import { describe, test, expect } from 'bun:test';
import { DEFAULT_LIMIT, FilterSchema, ReadableRepository, TFilter } from '@/base/repositories';

/**
 * Regression: FilterSchema must NEVER inject a default limit — not at the top level
 * and not inside relation `scope` objects. The top-level default (DEFAULT_LIMIT) is
 * applied later, by ReadableRepository.find(), so adding `order` (or any field) to a
 * relation scope must not silently cap the relation at DEFAULT_LIMIT rows.
 */
describe('FilterSchema - no default limit injection', () => {
  test('top-level filter does not inject a limit at parse time', () => {
    const parsed = FilterSchema.parse({ where: { name: 'x' } });
    expect(parsed?.limit).toBeUndefined();
  });

  test('relation scope with order does NOT inject a default limit', () => {
    const parsed = FilterSchema.parse({
      include: [{ relation: 'categories', scope: { order: ['createdAt DESC'] } }],
    });

    const scope = parsed?.include?.[0]?.scope;
    expect(scope?.order).toEqual(['createdAt DESC']);
    expect(scope?.limit).toBeUndefined();
  });

  test('relation without scope stays undefined', () => {
    const parsed = FilterSchema.parse({
      include: [{ relation: 'categories' }],
    });

    expect(parsed?.include?.[0]?.scope).toBeUndefined();
  });

  test('relation scope explicit limit is preserved', () => {
    const parsed = FilterSchema.parse({
      include: [{ relation: 'categories', scope: { limit: 5 } }],
    });

    expect(parsed?.include?.[0]?.scope?.limit).toBe(5);
  });

  test('nested relation scope (depth 2) also has no default limit', () => {
    const parsed = FilterSchema.parse({
      include: [
        {
          relation: 'categories',
          scope: { include: [{ relation: 'products', scope: { order: ['id ASC'] } }] },
        },
      ],
    });

    const inner = parsed?.include?.[0]?.scope?.include?.[0]?.scope;
    expect(inner?.order).toEqual(['id ASC']);
    expect(inner?.limit).toBeUndefined();
  });
});

/**
 * Behavioral guarantee: ReadableRepository.find() applies DEFAULT_LIMIT to the
 * TOP-LEVEL query only. It captures the filter handed to the underlying query
 * method without touching a database.
 */
class CapturingRepository extends ReadableRepository<any> {
  public captured?: TFilter<any>;

  constructor() {
    super(undefined, { scope: 'CapturingRepository' } as any);
  }

  // Avoid model-metadata / entity resolution.
  override getDefaultFilter() {
    return undefined;
  }

  protected override findWithCoreAPI<R = any>(opts: { filter: TFilter<any> }): Promise<Array<R>> {
    this.captured = opts.filter;
    return Promise.resolve([] as Array<R>);
  }

  protected override findWithQueryAPI<R = any>(opts: { filter: TFilter<any> }): Promise<Array<R>> {
    this.captured = opts.filter;
    return Promise.resolve([] as Array<R>);
  }
}

describe('ReadableRepository.find - default limit application', () => {
  test('applies DEFAULT_LIMIT to a top-level query with no limit', async () => {
    const repo = new CapturingRepository();
    await repo.find({ filter: { where: { name: 'x' } } });
    expect(repo.captured?.limit).toBe(DEFAULT_LIMIT);
  });

  test('keeps an explicit top-level limit', async () => {
    const repo = new CapturingRepository();
    await repo.find({ filter: { limit: 50 } });
    expect(repo.captured?.limit).toBe(50);
  });

  test('defaults the top-level limit but leaves relation scope uncapped', async () => {
    const repo = new CapturingRepository();
    await repo.find({
      filter: { include: [{ relation: 'categories', scope: { order: ['createdAt DESC'] } }] },
    });

    expect(repo.captured?.limit).toBe(DEFAULT_LIMIT);
    expect(repo.captured?.include?.[0]?.scope?.limit).toBeUndefined();
  });
});
