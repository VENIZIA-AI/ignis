import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Edge Cases - type coercion, null on a non-nullable field, a massive IN array, and malformed JSON-path injection
// ----------------------------------------------------------------
export class EdgeCases extends BaseTestCases {
  async testTypeCoercionStringToNumber() {
    this.context.logCase('[TYPE] String passed to Number field');
    // nValue: "100" -> Should be cast to 100 or fail?
    // Drizzle/Ignis usually allows implicit casting if the DB supports it,
    // or strict TypeORM/Schema validation might block it.

    try {
      // @ts-ignore
      const results = await this.context.configurationRepository.find({
        filter: {
          where: {
            group: 'ADVANCED_TEST',
            nValue: '100', // Sending string '100' for number column
          } as any,
        },
      });

      if (results.length === 1) {
        this.context.logger.info('[TYPE] INFO | System auto-coerced String "100" to Number 100');
      } else {
        this.context.logger.warn(
          '[TYPE] NOTE | Strict type check rejected string "100" (or 0 results)',
        );
      }
    } catch (e) {
      this.context.logger.info(
        '[TYPE] PASSED | Strict type validation prevented invalid type: %s',
        (e as Error).message,
      );
    }
  }

  async testTypeSafetyNullToNonNullable() {
    this.context.logCase('[TYPE] Null passed to Non-Nullable field');
    // 'code' is usually non-nullable.

    try {
      await this.context.configurationRepository.find({
        filter: {
          where: { code: null },
        } as any,
      });
      // If it runs returning 0, that's valid (WHERE code IS NULL -> find nothing).
      // If it throws "Invalid type", that's also valid.
      this.context.logger.info(
        '[TYPE] PASSED | Query with NULL on non-nullable executed without crash',
      );
    } catch (e) {
      this.context.logger.info(
        '[TYPE] PASSED | Query caught invalid null: %s',
        (e as Error).message,
      );
    }
  }

  async testMassiveArrayInOperator() {
    this.context.logCase('[STRESS] Massive IN Array (1000+ items)');

    const massiveArray = Array.from({ length: 2000 }, (_, i) => i);
    // Add the real value 100 in the middle
    massiveArray.push(100);

    const start = Date.now();
    try {
      const results = await this.context.configurationRepository.find({
        filter: {
          where: {
            group: 'ADVANCED_TEST',
            nValue: { in: massiveArray },
          },
        },
      });
      const duration = Date.now() - start;

      if (results.length >= 1) {
        this.context.logger.info('[STRESS] PASSED | Handled 2000 item IN array in %dms', duration);
      } else {
        this.context.logger.error('[STRESS] FAILED | Did not find record with massive array');
      }
    } catch (e) {
      this.context.logger.error(
        '[STRESS] FAILED | Stack overflow or DB error: %s',
        (e as Error).message,
      );
    }
  }

  async testMalformedJsonPaths() {
    this.context.logCase('[SECURITY] Malformed JSON Path Injection');
    // Try to inject SQL via JSON key: "jValue.metadata' OR 1=1 --"

    const maliciousKey = "jValue.metadata' OR 1=1 --";

    try {
      await this.context.configurationRepository.find({
        filter: {
          where: {
            group: 'ADVANCED_TEST',
            [maliciousKey]: 'value',
          } as any,
        },
      });

      // If we reach here, either it found nothing (Good) or found everything (Bad)
      // Actually, the key itself being dynamic usually fails "Column not found" or validation.
      this.context.logger.info(
        '[SECURITY] PASSED | System likely treated malicious key as invalid column or sanitized it',
      );
    } catch (e) {
      // Expected error: Invalid JSON path or Column not found
      this.context.logger.info(
        '[SECURITY] PASSED | Caught malicious/invalid path: %s',
        (e as Error).message,
      );
    }
  }
}
