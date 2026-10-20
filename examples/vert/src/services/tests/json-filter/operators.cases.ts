import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Operators Cases - scalar comparison operators on a JSON path (neq, gt/gte, lt/lte, like/ilike)
// ----------------------------------------------------------------
export class OperatorsCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 5: Filter with neq operator
  // ----------------------------------------------------------------
  async case5FilterWithNeqOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 5] Filter by jValue.priority neq 3');

    const group = 'JSON_FILTER_TEST';

    try {
      const results = await repo.find({
        filter: {
          where: { group, 'jValue.priority': { neq: 3 } } as any,
        },
      });

      if (results.length === 4) {
        const priorities = results.map(r => (r.jValue as any)?.priority);
        const hasNoThree = priorities.every(p => p !== 3);
        if (hasNoThree) {
          this.context.logger.info('[CASE 5] PASSED | Found 4 records with priority != 3');
          this.context.logger.info('[CASE 5] Priorities: %j', priorities);
        } else {
          this.context.logger.error('[CASE 5] FAILED | Some results have priority = 3');
        }
      } else {
        this.context.logger.error('[CASE 5] FAILED | Expected 4 records | got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[CASE 5] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 6: Filter with gt/gte operators
  // ----------------------------------------------------------------
  async case6FilterWithGtGteOperators(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 6] Filter by jValue.priority > 3');

    const group = 'JSON_FILTER_TEST';

    try {
      // Test gt (greater than)
      const gtResults = await repo.find({
        filter: {
          where: { group, 'jValue.priority': { gt: 3 } } as any,
        },
      });

      if (gtResults.length === 2) {
        const priorities = gtResults.map(r => (r.jValue as any)?.priority);
        const allGreater = priorities.every(p => p > 3);
        if (allGreater) {
          this.context.logger.info('[CASE 6] PASSED | gt: Found 2 records with priority > 3');
          this.context.logger.info('[CASE 6] Priorities: %j', priorities);
        } else {
          this.context.logger.error('[CASE 6] FAILED | gt: Not all priorities > 3');
        }
      } else {
        this.context.logger.error(
          '[CASE 6] FAILED | gt: Expected 2 records | got: %d',
          gtResults.length,
        );
      }

      // Test gte (greater than or equal)
      const gteResults = await repo.find({
        filter: {
          where: { group, 'jValue.priority': { gte: 3 } } as any,
        },
      });

      if (gteResults.length === 3) {
        const priorities = gteResults.map(r => (r.jValue as any)?.priority);
        const allGte = priorities.every(p => p >= 3);
        if (allGte) {
          this.context.logger.info('[CASE 6] PASSED | gte: Found 3 records with priority >= 3');
          this.context.logger.info('[CASE 6] Priorities: %j', priorities);
        } else {
          this.context.logger.error('[CASE 6] FAILED | gte: Not all priorities >= 3');
        }
      } else {
        this.context.logger.error(
          '[CASE 6] FAILED | gte: Expected 3 records | got: %d',
          gteResults.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 6] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 7: Filter with lt/lte operators
  // ----------------------------------------------------------------
  async case7FilterWithLtLteOperators(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 7] Filter by jValue.metadata.score < 80');

    const group = 'JSON_FILTER_TEST';

    try {
      // Test lt (less than)
      const ltResults = await repo.find({
        filter: {
          where: { group, 'jValue.metadata.score': { lt: 80 } } as any,
        },
      });

      if (ltResults.length === 2) {
        const scores = ltResults.map(r => (r.jValue as any)?.metadata?.score);
        const allLess = scores.every(s => s < 80);
        if (allLess) {
          this.context.logger.info('[CASE 7] PASSED | lt: Found 2 records with score < 80');
          this.context.logger.info('[CASE 7] Scores: %j', scores);
        } else {
          this.context.logger.error('[CASE 7] FAILED | lt: Not all scores < 80');
        }
      } else {
        this.context.logger.error(
          '[CASE 7] FAILED | lt: Expected 2 records | got: %d',
          ltResults.length,
        );
      }

      // Test lte (less than or equal)
      const lteResults = await repo.find({
        filter: {
          where: { group, 'jValue.metadata.score': { lte: 85 } } as any,
        },
      });

      if (lteResults.length === 3) {
        const scores = lteResults.map(r => (r.jValue as any)?.metadata?.score);
        const allLte = scores.every(s => s <= 85);
        if (allLte) {
          this.context.logger.info('[CASE 7] PASSED | lte: Found 3 records with score <= 85');
          this.context.logger.info('[CASE 7] Scores: %j', scores);
        } else {
          this.context.logger.error('[CASE 7] FAILED | lte: Not all scores <= 85');
        }
      } else {
        this.context.logger.error(
          '[CASE 7] FAILED | lte: Expected 3 records | got: %d',
          lteResults.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 7] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 8: Filter with like/ilike operators
  // ----------------------------------------------------------------
  async case8FilterWithLikeIlike(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 8] Filter by jValue.metadata.level like "%igh%"');

    const group = 'JSON_FILTER_TEST';

    try {
      // Test like
      const likeResults = await repo.find({
        filter: {
          where: { group, 'jValue.metadata.level': { like: '%igh%' } } as any,
        },
      });

      if (likeResults.length === 2) {
        const levels = likeResults.map(r => (r.jValue as any)?.metadata?.level);
        const allMatch = levels.every(l => l.includes('igh'));
        if (allMatch) {
          this.context.logger.info(
            '[CASE 8] PASSED | like: Found 2 records with level containing "igh"',
          );
          this.context.logger.info('[CASE 8] Levels: %j', levels);
        } else {
          this.context.logger.error('[CASE 8] FAILED | like: Not all levels contain "igh"');
        }
      } else {
        this.context.logger.error(
          '[CASE 8] FAILED | like: Expected 2 records | got: %d',
          likeResults.length,
        );
      }

      // Test ilike (case-insensitive)
      const ilikeResults = await repo.find({
        filter: {
          where: { group, 'jValue.metadata.level': { ilike: '%IGH%' } } as any,
        },
      });

      if (ilikeResults.length === 2) {
        this.context.logger.info('[CASE 8] PASSED | ilike: Found 2 records (case-insensitive)');
      } else {
        this.context.logger.error(
          '[CASE 8] FAILED | ilike: Expected 2 records | got: %d',
          ilikeResults.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 8] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 12: Combined JSON + regular filter
  // ----------------------------------------------------------------
  async case12CombinedJsonAndRegularFilter(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 12] Combined filter: group + jValue.priority > 2');

    const group = 'JSON_FILTER_TEST';

    try {
      const results = await repo.find({
        filter: {
          where: { group, 'jValue.priority': { gt: 2 } } as any,
        },
      });

      if (results.length === 3) {
        const priorities = results.map(r => (r.jValue as any)?.priority);
        const allCorrect = priorities.every(p => p > 2);
        if (allCorrect) {
          this.context.logger.info('[CASE 12] PASSED | Combined filter returned 3 records');
          this.context.logger.info('[CASE 12] Priorities: %j', priorities);
        } else {
          this.context.logger.error('[CASE 12] FAILED | Not all priorities > 2');
        }
      } else {
        this.context.logger.error(
          '[CASE 12] FAILED | Expected 3 records | got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 12] FAILED | Error: %s', (error as Error).message);
    }
  }
}
