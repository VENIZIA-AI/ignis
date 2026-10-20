import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Overlaps Cases - the && (overlaps) operator: match, no-match and empty-array
// ----------------------------------------------------------------
export class OverlapsCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 7: Overlaps - shares any element
  // ----------------------------------------------------------------
  async case7OverlapsWithArray(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 7] Overlaps: tags && [premium, clothing]');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { overlaps: ['premium', 'clothing'] },
          } as any,
        },
      });

      // Product B: has premium ✓
      // Product C: has clothing ✓
      if (results.length === 2) {
        const names = results.map(r => r.name).sort();
        if (names.includes('Product B') && names.includes('Product C')) {
          this.context.logger.info('[CASE 7] PASSED | Found 2 products with overlapping tags');
          this.context.logger.info('[CASE 7] Products: %j', names);
        } else {
          this.context.logger.error('[CASE 7] FAILED | Wrong products returned');
        }
      } else {
        this.context.logger.error(
          '[CASE 7] FAILED | Expected 2 products | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 7] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 8: Overlaps - no matching elements
  // ----------------------------------------------------------------
  async case8OverlapsNoMatch(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 8] Overlaps: tags && [nonexistent]');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { overlaps: ['nonexistent'] },
          } as any,
        },
      });

      if (results.length === 0) {
        this.context.logger.info('[CASE 8] PASSED | No products with nonexistent tag');
      } else {
        this.context.logger.error(
          '[CASE 8] FAILED | Expected 0 products | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 8] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 9: Overlaps - empty array (no overlap possible)
  // ----------------------------------------------------------------
  async case9OverlapsEmptyArray(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[CASE 9] Overlaps: tags && [] (empty array)');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { overlaps: [] },
          } as any,
        },
      });

      // Empty array overlaps with nothing
      if (results.length === 0) {
        this.context.logger.info('[CASE 9] PASSED | Empty array overlaps with nothing');
      } else {
        this.context.logger.error(
          '[CASE 9] FAILED | Expected 0 products | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 9] FAILED | Error: %s', (error as Error).message);
    }
  }
}
