import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// String Cases - LIKE/ILIKE/REGEXP operators and string-value edge cases
// ----------------------------------------------------------------
export class StringCases extends BaseTestCases {
  // ================================================================
  // SECTION 3: STRING OPERATORS
  // ================================================================

  async testLikeOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[LIKE] like operator: { tValue: { like: "%eta%" } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: { like: '%eta%' } },
        },
      });

      // Should find 'beta'
      if (results.length === 1 && results[0].tValue === 'beta') {
        this.context.logger.info('[LIKE] PASSED | Found record with tValue containing "eta"');
      } else {
        this.context.logger.error(
          '[LIKE] FAILED | Expected "beta" | Got: %j',
          results.map(r => r.tValue),
        );
      }
    } catch (error) {
      this.context.logger.error('[LIKE] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testNotLikeOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[NLIKE] nlike operator: { tValue: { nlike: "%alpha%" } }');

    try {
      const results = await repo.find({
        filter: {
          where: {
            group: 'COMPREHENSIVE_TEST',
            tValue: { nlike: '%alpha%', isn: null },
          },
        },
      });

      const noneAlpha = results.every(r => !r.tValue?.includes('alpha'));
      if (noneAlpha && results.length >= 5) {
        this.context.logger.info(
          '[NLIKE] PASSED | Found %d records NOT containing "alpha"',
          results.length,
        );
      } else {
        this.context.logger.error('[NLIKE] FAILED | Some records contain "alpha"');
      }
    } catch (error) {
      this.context.logger.error('[NLIKE] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testIlikeOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase(
      '[ILIKE] ilike operator (case-insensitive): { tValue: { ilike: "%ALPHA%" } }',
    );

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: { ilike: '%ALPHA%' } },
        },
      });

      // Should find 'alpha' despite uppercase search
      if (results.length === 1 && results[0].tValue?.toLowerCase() === 'alpha') {
        this.context.logger.info('[ILIKE] PASSED | Case-insensitive match found "alpha"');
      } else {
        this.context.logger.error(
          '[ILIKE] FAILED | Expected "alpha" | Got: %j',
          results.map(r => r.tValue),
        );
      }
    } catch (error) {
      this.context.logger.error('[ILIKE] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testNotIlikeOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase(
      '[NILIKE] nilike operator (NOT case-insensitive): { tValue: { nilike: "%BETA%" } }',
    );

    try {
      const results = await repo.find({
        filter: {
          where: {
            group: 'COMPREHENSIVE_TEST',
            tValue: { nilike: '%BETA%', isn: null },
          },
        },
      });

      const noneBeta = results.every(r => !r.tValue?.toLowerCase().includes('beta'));
      if (noneBeta && results.length >= 5) {
        this.context.logger.info(
          '[NILIKE] PASSED | Found %d records NOT containing "beta" (case-insensitive)',
          results.length,
        );
      } else {
        this.context.logger.error('[NILIKE] FAILED | Some records contain "beta"');
      }
    } catch (error) {
      this.context.logger.error('[NILIKE] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testRegexpOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase(
      '[REGEXP] regexp operator (PostgreSQL POSIX): { tValue: { regexp: "^a.*" } }',
    );

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: { regexp: '^a.*' } },
        },
      });

      // Should find 'alpha'
      if (results.length === 1 && results[0].tValue === 'alpha') {
        this.context.logger.info('[REGEXP] PASSED | Regex ^a.* matched "alpha"');
      } else {
        this.context.logger.error(
          '[REGEXP] FAILED | Expected "alpha" | Got: %j',
          results.map(r => r.tValue),
        );
      }
    } catch (error) {
      this.context.logger.error('[REGEXP] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testIregexpOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase(
      '[IREGEXP] iregexp operator (case-insensitive regex): { tValue: { iregexp: "^GAMMA$" } }',
    );

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: { iregexp: '^GAMMA$' } },
        },
      });

      // Should find 'gamma' despite uppercase regex
      if (results.length === 1 && results[0].tValue?.toLowerCase() === 'gamma') {
        this.context.logger.info('[IREGEXP] PASSED | Case-insensitive regex matched "gamma"');
      } else {
        this.context.logger.error(
          '[IREGEXP] FAILED | Expected "gamma" | Got: %j',
          results.map(r => r.tValue),
        );
      }
    } catch (error) {
      this.context.logger.error('[IREGEXP] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ================================================================
  // SECTION 7: EDGE CASES
  // ================================================================

  async testEmptyStringEquality(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[EMPTY-STR] Empty string equality: { tValue: "" }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: '' },
        },
      });

      // Should find the record with empty tValue
      if (results.length === 1 && results[0].tValue === '') {
        this.context.logger.info('[EMPTY-STR] PASSED | Found record with empty string tValue');
      } else {
        this.context.logger.error(
          '[EMPTY-STR] FAILED | Expected 1 record with empty string | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[EMPTY-STR] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testSpecialCharactersInLike(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase(`[SPECIAL-LIKE] Special characters in LIKE: { tValue: { like: "%'%" } }`);

    try {
      // Search for records containing single quote
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: { like: "%'%" } },
        },
      });

      // Should find "test'value"
      if (results.length >= 1 && results.some(r => r.tValue?.includes("'"))) {
        this.context.logger.info('[SPECIAL-LIKE] PASSED | Found record with single quote in value');
      } else {
        this.context.logger.error(
          '[SPECIAL-LIKE] FAILED | Expected record with quote | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[SPECIAL-LIKE] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testJsonSpecialCharactersInValue(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[JSON-SPECIAL] JSON with special characters');

    try {
      // Query for JSON field containing single quote
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', 'jValue.name': { like: "%'%" } } as any,
        },
      });

      if (results.length >= 1) {
        this.context.logger.info('[JSON-SPECIAL] PASSED | Found record with special char in JSON');
      } else {
        this.context.logger.info('[JSON-SPECIAL] INFO | No records with special chars found');
      }
    } catch (error) {
      this.context.logger.error('[JSON-SPECIAL] FAILED | Error: %s', (error as Error).message);
    }
  }
}
