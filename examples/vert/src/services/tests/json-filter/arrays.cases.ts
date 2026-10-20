import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Arrays Cases - array-shaped filters: array-index paths, in/nin/between, and/or condition lists
// ----------------------------------------------------------------
export class ArraysCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 4: Filter by array index (eq)
  // ----------------------------------------------------------------
  async case4FilterByArrayIndex(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 4] Filter by jValue.tags[0] = "important"');

    const group = 'JSON_FILTER_TEST';

    try {
      const results = await repo.find({
        filter: {
          where: { group, 'jValue.tags[0]': 'important' } as any,
        },
      });

      if (results.length === 1 && (results[0].jValue as any)?.tags?.[0] === 'important') {
        this.context.logger.info('[CASE 4] PASSED | Found 1 record with tags[0] = "important"');
        this.context.logger.info('[CASE 4] Record name: %s', (results[0].jValue as any)?.name);
      } else {
        this.context.logger.error('[CASE 4] FAILED | Expected 1 record | got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[CASE 4] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 9: Filter with in operator
  // Note: JSON #>> returns TEXT, so we use string values for comparison
  // ----------------------------------------------------------------
  async case9FilterWithInOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 9] Filter by jValue.priority in ["1", "2", "3"] (TEXT comparison)');

    const group = 'JSON_FILTER_TEST';

    try {
      // Note: JSON #>> operator returns TEXT, so we compare as strings
      const results = await repo.find({
        filter: {
          where: { group, 'jValue.priority': { in: ['1', '2', '3'] } } as any,
        },
      });

      if (results.length === 3) {
        const priorities = results.map(r => (r.jValue as any)?.priority);
        // The actual JSON values are numbers, but the query matched via TEXT comparison
        const allInRange = priorities.every(p => [1, 2, 3].includes(p));
        if (allInRange) {
          this.context.logger.info('[CASE 9] PASSED | Found 3 records with priority in [1, 2, 3]');
          this.context.logger.info(
            '[CASE 9] Priorities: %j (matched via TEXT: "1", "2", "3")',
            priorities,
          );
        } else {
          this.context.logger.error('[CASE 9] FAILED | Not all priorities in [1, 2, 3]');
        }
      } else {
        this.context.logger.error('[CASE 9] FAILED | Expected 3 records | got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[CASE 9] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: Filter with nin operator
  // Note: JSON #>> returns TEXT, so we use string values for comparison
  // ----------------------------------------------------------------
  async case10FilterWithNinOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 10] Filter by jValue.priority nin ["1", "2"] (TEXT comparison)');

    const group = 'JSON_FILTER_TEST';

    try {
      // Note: JSON #>> operator returns TEXT, so we compare as strings
      const results = await repo.find({
        filter: {
          where: { group, 'jValue.priority': { nin: ['1', '2'] } } as any,
        },
      });

      if (results.length === 3) {
        const priorities = results.map(r => (r.jValue as any)?.priority);
        // The actual JSON values are numbers, but the query matched via TEXT comparison
        const noneInRange = priorities.every(p => ![1, 2].includes(p));
        if (noneInRange) {
          this.context.logger.info(
            '[CASE 10] PASSED | Found 3 records with priority not in [1, 2]',
          );
          this.context.logger.info(
            '[CASE 10] Priorities: %j (excluded via TEXT: "1", "2")',
            priorities,
          );
        } else {
          this.context.logger.error('[CASE 10] FAILED | Some priorities in [1, 2]');
        }
      } else {
        this.context.logger.error(
          '[CASE 10] FAILED | Expected 3 records | got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 10] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 11: Filter with between operator
  // ----------------------------------------------------------------
  async case11FilterWithBetweenOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 11] Filter by jValue.metadata.score between [70, 95]');

    const group = 'JSON_FILTER_TEST';

    try {
      const results = await repo.find({
        filter: {
          where: { group, 'jValue.metadata.score': { between: [70, 95] } } as any,
        },
      });

      if (results.length === 3) {
        const scores = results.map(r => (r.jValue as any)?.metadata?.score);
        const allInRange = scores.every(s => s >= 70 && s <= 95);
        if (allInRange) {
          this.context.logger.info('[CASE 11] PASSED | Found 3 records with score between 70-95');
          this.context.logger.info('[CASE 11] Scores: %j', scores);
        } else {
          this.context.logger.error('[CASE 11] FAILED | Not all scores in range 70-95');
        }
      } else {
        this.context.logger.error(
          '[CASE 11] FAILED | Expected 3 records | got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 11] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 13: AND with multiple JSON paths
  // ----------------------------------------------------------------
  async case13AndWithMultipleJsonPaths(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 13] AND: jValue.priority > 2 AND jValue.metadata.level = "high"');

    const group = 'JSON_FILTER_TEST';

    try {
      const results = await repo.find({
        filter: {
          where: {
            group,
            and: [{ 'jValue.priority': { gt: 2 } }, { 'jValue.metadata.level': 'high' }],
          } as any,
        },
      });

      if (results.length === 2) {
        const isCorrect = results.every(r => {
          const priority = (r.jValue as any)?.priority;
          const level = (r.jValue as any)?.metadata?.level;
          return priority > 2 && level === 'high';
        });

        if (isCorrect) {
          this.context.logger.info('[CASE 13] PASSED | AND filter returned 2 records');
          this.context.logger.info(
            '[CASE 13] Records: %j',
            results.map(r => ({
              priority: (r.jValue as any)?.priority,
              level: (r.jValue as any)?.metadata?.level,
            })),
          );
        } else {
          this.context.logger.error('[CASE 13] FAILED | Results do not match AND conditions');
        }
      } else {
        this.context.logger.error(
          '[CASE 13] FAILED | Expected 2 records | got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 13] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 14: OR with JSON paths
  // ----------------------------------------------------------------
  async case14OrWithJsonPaths(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 14] OR: jValue.priority = 1 OR jValue.priority = 5');

    const group = 'JSON_FILTER_TEST';

    try {
      const results = await repo.find({
        filter: {
          where: {
            group,
            or: [{ 'jValue.priority': 1 }, { 'jValue.priority': 5 }],
          } as any,
        },
      });

      if (results.length === 2) {
        const priorities = results.map(r => (r.jValue as any)?.priority);
        const isCorrect = priorities.every(p => p === 1 || p === 5);
        if (isCorrect) {
          this.context.logger.info('[CASE 14] PASSED | OR filter returned 2 records');
          this.context.logger.info('[CASE 14] Priorities: %j', priorities);
        } else {
          this.context.logger.error('[CASE 14] FAILED | Results do not match OR conditions');
        }
      } else {
        this.context.logger.error(
          '[CASE 14] FAILED | Expected 2 records | got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 14] FAILED | Error: %s', (error as Error).message);
    }
  }
}
