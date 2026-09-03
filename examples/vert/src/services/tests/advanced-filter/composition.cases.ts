import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Composition Cases - logical tree composition: AND/OR nesting, De Morgan, deep recursion,
// implicit/explicit mixing
// ----------------------------------------------------------------
export class CompositionCases extends BaseTestCases {
  async testComplexLogicalTreeAoBAndCoD(): Promise<void> {
    this.context.logCase('[LOGIC] (A OR B) AND (C OR D)');
    // (nValue > 150 OR nValue < 50) AND (tValue like 'status_pending' OR tValue like 'status_archived')

    try {
      const results = await this.context.configurationRepository.find({
        filter: {
          where: {
            group: 'ADVANCED_TEST',
            and: [
              { or: [{ nValue: { gt: 150 } }, { nValue: { lt: 50 } }] },
              { or: [{ tValue: { like: '%pending' } }, { tValue: { like: '%archived' } }] },
            ],
          } as any,
        },
      });

      // C1: n=100 (False OR False -> False) AND ... -> Excluded
      // C2: n=200 (True) AND (pending (True)) -> MATCH (200 > 150)
      // C3: n=300 (True) AND (archived (True)) -> MATCH (300 > 150)

      if (results.length === 2) {
        this.context.logger.info('[LOGIC] PASSED | Correctly handled (A OR B) AND (C OR D)');
      } else {
        this.context.logger.error('[LOGIC] FAILED | Expected 2 records, got %d', results.length);
        this.context.logger.error(
          'Results: %j',
          results.map(r => ({ n: r.nValue, t: r.tValue })),
        );
      }
    } catch (e) {
      this.context.logger.error('[LOGIC] FAILED | %s', (e as Error).message);
    }
  }

  async testDeMorgansLawNotAorB(): Promise<void> {
    this.context.logCase('[LOGIC] NOT (A OR B) -> via explicit NOT IN operator');
    // Testing: nValue NOT IN [100, 200]
    // Equivalent to NOT (n=100 OR n=200) -> n!=100 AND n!=200

    try {
      const results = await this.context.configurationRepository.find({
        filter: {
          where: {
            group: 'ADVANCED_TEST',
            nValue: { nin: [100, 200] },
          } as any,
        },
      });

      // Should match C3 (300) only (from the 3 setup items)
      if (results.length === 1 && results[0].nValue === 300) {
        this.context.logger.info('[LOGIC] PASSED | NOT (A OR B) via NIN worked correctly');
      } else {
        this.context.logger.error(
          '[LOGIC] FAILED | Expected 1 record (300), got %d',
          results.length,
        );
      }
    } catch (e) {
      this.context.logger.error('[LOGIC] FAILED | %s', (e as Error).message);
    }
  }

  async testDeeplyNestedRecursion(): Promise<void> {
    this.context.logCase('[LOGIC] Deeply Nested Recursion (10+ levels)');
    // Construct a deeply nested AND chain: AND(AND(AND(...)))

    let nestedFilter: any = { nValue: { gt: 0 } };
    for (let i = 0; i < 15; i++) {
      nestedFilter = { and: [nestedFilter] };
    }

    try {
      const results = await this.context.configurationRepository.find({
        filter: {
          where: {
            group: 'ADVANCED_TEST',
            ...nestedFilter,
          } as any,
        },
      });

      // Should return all 3 records as nValue > 0 is true for all
      if (results.length === 3) {
        this.context.logger.info('[LOGIC] PASSED | Handled 15 levels of nested ANDs');
      } else {
        this.context.logger.error(
          '[LOGIC] FAILED | Recursion failed or lost data. Count: %d',
          results.length,
        );
      }
    } catch (e) {
      this.context.logger.error(
        '[LOGIC] FAILED | Stack overflow or parser error: %s',
        (e as Error).message,
      );
    }
  }

  async testImplicitExplicitLogicMixing(): Promise<void> {
    this.context.logCase('[LOGIC] Mixing implicit object keys AND explicit operators');
    // { nValue: 100, or: [{ tValue: 'x' }, { tValue: 'status_active' }] }
    // Should be parsed as: nValue = 100 AND (tValue = 'x' OR tValue = 'status_active')

    try {
      const results = await this.context.configurationRepository.find({
        filter: {
          where: {
            group: 'ADVANCED_TEST',
            nValue: 100,
            or: [{ tValue: 'non_existent' }, { tValue: 'status_active' }],
          } as any,
        },
      });

      // Config 1 matches nValue=100 and tValue='status_active'
      if (results.length === 1 && results[0].nValue === 100) {
        this.context.logger.info(
          '[LOGIC] PASSED | Mixed implicit/explicit logic precedence is correct',
        );
      } else {
        this.context.logger.error('[LOGIC] FAILED | Expected 1 record, got %d', results.length);
      }
    } catch (e) {
      this.context.logger.error('[LOGIC] FAILED | %s', (e as Error).message);
    }
  }
}
